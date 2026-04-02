-- Announcements / in-site messages
-- Platform super admin can publish global/tenant announcements,
-- and fan out to notifications table.

CREATE TABLE IF NOT EXISTS public.system_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('global', 'tenant')),
  tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'warning', 'success', 'error')),
  link text NULL,
  created_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_announcements_created_at
  ON public.system_announcements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_announcements_scope_tenant
  ON public.system_announcements(scope, tenant_id);

ALTER TABLE public.system_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS system_announcements_select_none ON public.system_announcements;
CREATE POLICY system_announcements_select_none
ON public.system_announcements
FOR SELECT
USING (false);

DROP POLICY IF EXISTS system_announcements_modify_none ON public.system_announcements;
CREATE POLICY system_announcements_modify_none
ON public.system_announcements
FOR ALL
USING (false)
WITH CHECK (false);

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

CREATE OR REPLACE FUNCTION public.list_system_announcements(
  p_limit integer DEFAULT 50
)
RETURNS TABLE(
  id uuid,
  scope text,
  tenant_id uuid,
  title text,
  message text,
  type text,
  link text,
  created_by uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.employees%ROWTYPE;
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
BEGIN
  SELECT e.* INTO v_actor
  FROM public.employees e
  JOIN public.profiles p ON p.employee_id = e.id
  WHERE p.id = auth.uid()
  LIMIT 1;

  IF v_actor.id IS NULL OR v_actor.is_super_admin <> true THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.scope,
    a.tenant_id,
    a.title,
    a.message,
    a.type,
    a.link,
    a.created_by,
    a.created_at
  FROM public.system_announcements a
  ORDER BY a.created_at DESC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.publish_system_announcement(text, uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_system_announcements(integer) TO authenticated;
