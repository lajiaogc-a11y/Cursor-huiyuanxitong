-- API rate limiting (first batch)
-- 1) Generic DB-side limiter function
-- 2) Login flow limiter (client calls rpc before verify)
-- 3) Announcement publish limiter (server-side guard)

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  actor_key text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scope, actor_key, window_started_at)
);

ALTER TABLE public.api_rate_limits
  ADD COLUMN IF NOT EXISTS scope text,
  ADD COLUMN IF NOT EXISTS actor_key text,
  ADD COLUMN IF NOT EXISTS window_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS request_count integer,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

UPDATE public.api_rate_limits
SET
  scope = COALESCE(NULLIF(trim(scope), ''), 'default'),
  actor_key = COALESCE(NULLIF(trim(actor_key), ''), 'unknown'),
  window_started_at = COALESCE(window_started_at, date_trunc('minute', now())),
  request_count = COALESCE(request_count, 0),
  updated_at = COALESCE(updated_at, now())
WHERE
  scope IS NULL
  OR actor_key IS NULL
  OR window_started_at IS NULL
  OR request_count IS NULL
  OR updated_at IS NULL;

ALTER TABLE public.api_rate_limits
  ALTER COLUMN scope SET NOT NULL,
  ALTER COLUMN actor_key SET NOT NULL,
  ALTER COLUMN window_started_at SET NOT NULL,
  ALTER COLUMN request_count SET NOT NULL,
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.api_rate_limits
  ALTER COLUMN request_count SET DEFAULT 0,
  ALTER COLUMN updated_at SET DEFAULT now();

-- Deduplicate historical rows before unique index creation
WITH ranked AS (
  SELECT
    ctid,
    ROW_NUMBER() OVER (
      PARTITION BY scope, actor_key, window_started_at
      ORDER BY updated_at DESC, ctid DESC
    ) AS rn
  FROM public.api_rate_limits
)
DELETE FROM public.api_rate_limits t
USING ranked r
WHERE t.ctid = r.ctid
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_rate_limits_scope_actor_window
  ON public.api_rate_limits(scope, actor_key, window_started_at);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_scope_actor_updated
  ON public.api_rate_limits(scope, actor_key, updated_at DESC);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_rate_limits_select_none ON public.api_rate_limits;
CREATE POLICY api_rate_limits_select_none
ON public.api_rate_limits
FOR SELECT
USING (false);

DROP POLICY IF EXISTS api_rate_limits_modify_none ON public.api_rate_limits;
CREATE POLICY api_rate_limits_modify_none
ON public.api_rate_limits
FOR ALL
USING (false)
WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.check_api_rate_limit(
  p_scope text,
  p_actor_key text,
  p_limit integer DEFAULT 30,
  p_window_seconds integer DEFAULT 60
)
RETURNS TABLE(
  allowed boolean,
  remaining integer,
  retry_after_seconds integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scope text := trim(lower(COALESCE(p_scope, '')));
  v_actor_key text := trim(lower(COALESCE(p_actor_key, '')));
  v_limit integer := GREATEST(COALESCE(p_limit, 30), 1);
  v_window_seconds integer := GREATEST(COALESCE(p_window_seconds, 60), 1);
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_count integer := 0;
BEGIN
  IF v_scope = '' OR v_actor_key = '' THEN
    RETURN QUERY SELECT false, 0, v_window_seconds;
    RETURN;
  END IF;

  -- Align to fixed windows for simple retry-after semantics
  v_window_start :=
    to_timestamp(floor(extract(epoch from v_now) / v_window_seconds) * v_window_seconds);

  INSERT INTO public.api_rate_limits (scope, actor_key, window_started_at, request_count, updated_at)
  VALUES (v_scope, v_actor_key, v_window_start, 1, v_now)
  ON CONFLICT (scope, actor_key, window_started_at)
  DO UPDATE SET
    request_count = public.api_rate_limits.request_count + 1,
    updated_at = EXCLUDED.updated_at
  RETURNING request_count INTO v_count;

  IF v_count > v_limit THEN
    RETURN QUERY
    SELECT false, 0, GREATEST(1, v_window_seconds - floor(extract(epoch from (v_now - v_window_start)))::integer);
  ELSE
    RETURN QUERY
    SELECT true, GREATEST(v_limit - v_count, 0), 0;
  END IF;
END;
$$;

-- Recreate publish announcement with server-side rate-limit guard
CREATE OR REPLACE FUNCTION public.publish_system_announcement(
  p_scope text,
  p_tenant_id uuid DEFAULT NULL,
  p_title text DEFAULT '',
  p_message text DEFAULT '',
  p_type text DEFAULT 'info',
  p_link text DEFAULT NULL
)
RETURNS TABLE(success boolean, message text, announcement_id uuid, recipient_count integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.employees%ROWTYPE;
  v_scope text := trim(lower(COALESCE(p_scope, '')));
  v_type text := trim(lower(COALESCE(p_type, 'info')));
  v_title text := trim(COALESCE(p_title, ''));
  v_message text := trim(COALESCE(p_message, ''));
  v_announcement_id uuid;
  v_recipient_count integer := 0;
  v_rate_allowed boolean := true;
  v_rate_retry integer := 0;
BEGIN
  SELECT e.* INTO v_actor
  FROM public.employees e
  JOIN public.profiles p ON p.employee_id = e.id
  WHERE p.id = auth.uid()
  LIMIT 1;

  IF v_actor.id IS NULL OR v_actor.is_super_admin <> true THEN
    RETURN QUERY SELECT false, 'NO_PERMISSION', NULL::uuid, 0;
    RETURN;
  END IF;

  SELECT r.allowed, r.retry_after_seconds
    INTO v_rate_allowed, v_rate_retry
  FROM public.check_api_rate_limit(
    'publish_system_announcement',
    v_actor.id::text,
    20,   -- 20 times
    3600  -- per hour
  ) r
  LIMIT 1;

  IF NOT COALESCE(v_rate_allowed, false) THEN
    RETURN QUERY SELECT false, 'RATE_LIMITED:' || COALESCE(v_rate_retry, 0)::text, NULL::uuid, 0;
    RETURN;
  END IF;

  IF v_scope NOT IN ('global', 'tenant') THEN
    RETURN QUERY SELECT false, 'INVALID_SCOPE', NULL::uuid, 0;
    RETURN;
  END IF;

  IF v_scope = 'tenant' AND p_tenant_id IS NULL THEN
    RETURN QUERY SELECT false, 'TENANT_REQUIRED', NULL::uuid, 0;
    RETURN;
  END IF;

  IF v_title = '' OR v_message = '' THEN
    RETURN QUERY SELECT false, 'TITLE_AND_MESSAGE_REQUIRED', NULL::uuid, 0;
    RETURN;
  END IF;

  IF v_type NOT IN ('info', 'warning', 'success', 'error') THEN
    v_type := 'info';
  END IF;

  INSERT INTO public.system_announcements (scope, tenant_id, title, message, type, link, created_by)
  VALUES (
    v_scope,
    CASE WHEN v_scope = 'tenant' THEN p_tenant_id ELSE NULL END,
    v_title,
    v_message,
    v_type,
    NULLIF(trim(COALESCE(p_link, '')), ''),
    v_actor.id
  )
  RETURNING id INTO v_announcement_id;

  IF v_scope = 'global' THEN
    INSERT INTO public.notifications (recipient_id, title, message, type, category, link, metadata)
    SELECT
      e.id,
      v_title,
      v_message,
      v_type,
      'announcement',
      NULLIF(trim(COALESCE(p_link, '')), ''),
      jsonb_build_object('announcement_id', v_announcement_id, 'scope', v_scope)
    FROM public.employees e
    WHERE e.status = 'active';
  ELSE
    INSERT INTO public.notifications (recipient_id, title, message, type, category, link, metadata)
    SELECT
      e.id,
      v_title,
      v_message,
      v_type,
      'announcement',
      NULLIF(trim(COALESCE(p_link, '')), ''),
      jsonb_build_object('announcement_id', v_announcement_id, 'scope', v_scope, 'tenant_id', p_tenant_id)
    FROM public.employees e
    WHERE e.status = 'active'
      AND e.tenant_id = p_tenant_id;
  END IF;

  GET DIAGNOSTICS v_recipient_count = ROW_COUNT;
  RETURN QUERY SELECT true, 'OK', v_announcement_id, COALESCE(v_recipient_count, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_api_rate_limit(text, text, integer, integer) TO anon, authenticated;
