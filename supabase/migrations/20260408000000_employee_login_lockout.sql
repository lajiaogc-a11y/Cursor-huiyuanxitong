-- Employee login lockout (phase 1 security baseline)
-- Policy:
-- - Track failed attempts per employee
-- - Lock account for 15 minutes after 5 failures in a 15-minute window

CREATE TABLE IF NOT EXISTS public.employee_login_security (
  employee_id uuid PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  failed_attempts integer NOT NULL DEFAULT 0,
  first_failed_at timestamptz,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_login_security ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_login_security_select_none ON public.employee_login_security;
CREATE POLICY employee_login_security_select_none
ON public.employee_login_security
FOR SELECT
USING (false);

DROP POLICY IF EXISTS employee_login_security_modify_none ON public.employee_login_security;
CREATE POLICY employee_login_security_modify_none
ON public.employee_login_security
FOR ALL
USING (false)
WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.check_employee_login_lock(
  p_username text
)
RETURNS TABLE (
  is_locked boolean,
  remaining_seconds integer,
  locked_until timestamptz,
  failed_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
  v_row public.employee_login_security%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE username = trim(p_username)
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RETURN QUERY SELECT false, 0, NULL::timestamptz, 0;
    RETURN;
  END IF;

  SELECT * INTO v_row
  FROM public.employee_login_security
  WHERE employee_id = v_employee_id;

  IF v_row.employee_id IS NULL THEN
    RETURN QUERY SELECT false, 0, NULL::timestamptz, 0;
    RETURN;
  END IF;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > v_now THEN
    RETURN QUERY
    SELECT
      true,
      GREATEST(0, floor(extract(epoch FROM (v_row.locked_until - v_now)))::integer),
      v_row.locked_until,
      v_row.failed_attempts;
    RETURN;
  END IF;

  RETURN QUERY SELECT false, 0, v_row.locked_until, COALESCE(v_row.failed_attempts, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_employee_login_failure(
  p_username text,
  p_lock_threshold integer DEFAULT 5,
  p_lock_minutes integer DEFAULT 15,
  p_window_minutes integer DEFAULT 15
)
RETURNS TABLE (
  is_locked boolean,
  failed_attempts integer,
  remaining_seconds integer,
  locked_until timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
  v_row public.employee_login_security%ROWTYPE;
  v_now timestamptz := now();
  v_threshold integer := GREATEST(1, COALESCE(p_lock_threshold, 5));
  v_lock_minutes integer := GREATEST(1, COALESCE(p_lock_minutes, 15));
  v_window_minutes integer := GREATEST(1, COALESCE(p_window_minutes, 15));
BEGIN
  SELECT id INTO v_employee_id
  FROM public.employees
  WHERE username = trim(p_username)
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RETURN QUERY SELECT false, 0, 0, NULL::timestamptz;
    RETURN;
  END IF;

  INSERT INTO public.employee_login_security (employee_id, failed_attempts, first_failed_at, locked_until, updated_at)
  VALUES (v_employee_id, 0, NULL, NULL, v_now)
  ON CONFLICT (employee_id) DO NOTHING;

  SELECT * INTO v_row
  FROM public.employee_login_security
  WHERE employee_id = v_employee_id
  FOR UPDATE;

  IF v_row.locked_until IS NOT NULL AND v_row.locked_until > v_now THEN
    RETURN QUERY
    SELECT
      true,
      COALESCE(v_row.failed_attempts, 0),
      GREATEST(0, floor(extract(epoch FROM (v_row.locked_until - v_now)))::integer),
      v_row.locked_until;
    RETURN;
  END IF;

  IF v_row.first_failed_at IS NULL OR v_row.first_failed_at < (v_now - make_interval(mins => v_window_minutes)) THEN
    v_row.failed_attempts := 0;
    v_row.first_failed_at := v_now;
    v_row.locked_until := NULL;
  END IF;

  v_row.failed_attempts := COALESCE(v_row.failed_attempts, 0) + 1;

  IF v_row.failed_attempts >= v_threshold THEN
    v_row.locked_until := v_now + make_interval(mins => v_lock_minutes);
  END IF;

  UPDATE public.employee_login_security
  SET
    failed_attempts = v_row.failed_attempts,
    first_failed_at = v_row.first_failed_at,
    locked_until = v_row.locked_until,
    updated_at = v_now
  WHERE employee_id = v_employee_id;

  RETURN QUERY
  SELECT
    (v_row.locked_until IS NOT NULL AND v_row.locked_until > v_now),
    v_row.failed_attempts,
    CASE
      WHEN v_row.locked_until IS NOT NULL AND v_row.locked_until > v_now
      THEN GREATEST(0, floor(extract(epoch FROM (v_row.locked_until - v_now)))::integer)
      ELSE 0
    END,
    v_row.locked_until;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_employee_login_failures(
  p_employee_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.employee_login_security
  SET
    failed_attempts = 0,
    first_failed_at = NULL,
    locked_until = NULL,
    updated_at = now()
  WHERE employee_id = p_employee_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_employee_login_lock(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_employee_login_failure(text, integer, integer, integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_employee_login_failures(uuid) TO anon, authenticated;
