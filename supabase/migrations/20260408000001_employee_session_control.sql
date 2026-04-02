-- Employee session control (force logout abnormal sessions)
-- Phase-1 security baseline: admin/manager/super-admin can force logout target employee.

CREATE TABLE IF NOT EXISTS public.employee_session_controls (
  employee_id uuid PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  force_logout_after timestamptz,
  force_logout_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_session_controls ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_session_controls_select_none ON public.employee_session_controls;
CREATE POLICY employee_session_controls_select_none
ON public.employee_session_controls
FOR SELECT
USING (false);

DROP POLICY IF EXISTS employee_session_controls_modify_none ON public.employee_session_controls;
CREATE POLICY employee_session_controls_modify_none
ON public.employee_session_controls
FOR ALL
USING (false)
WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.force_logout_employee_sessions(
  p_admin_id uuid,
  p_target_employee_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_role public.app_role;
  v_admin_super boolean;
  v_target_exists boolean;
BEGIN
  SELECT role, COALESCE(is_super_admin, false)
  INTO v_admin_role, v_admin_super
  FROM public.employees
  WHERE id = p_admin_id
  LIMIT 1;

  IF v_admin_role IS NULL THEN
    RETURN QUERY SELECT false, 'NO_PERMISSION';
    RETURN;
  END IF;

  IF NOT (v_admin_super OR v_admin_role IN ('admin', 'manager')) THEN
    RETURN QUERY SELECT false, 'NO_PERMISSION';
    RETURN;
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.employees WHERE id = p_target_employee_id) INTO v_target_exists;
  IF NOT v_target_exists THEN
    RETURN QUERY SELECT false, 'TARGET_NOT_FOUND';
    RETURN;
  END IF;

  INSERT INTO public.employee_session_controls (employee_id, force_logout_after, force_logout_reason, updated_at)
  VALUES (p_target_employee_id, now(), NULLIF(trim(COALESCE(p_reason, '')), ''), now())
  ON CONFLICT (employee_id)
  DO UPDATE SET
    force_logout_after = EXCLUDED.force_logout_after,
    force_logout_reason = EXCLUDED.force_logout_reason,
    updated_at = now();

  RETURN QUERY SELECT true, 'OK';
END;
$$;

CREATE OR REPLACE FUNCTION public.check_my_session_revoked(
  p_session_issued_at timestamptz
)
RETURNS TABLE(should_logout boolean, reason text, force_logout_after timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_id uuid := auth.uid();
  v_employee_id uuid;
  v_ctrl public.employee_session_controls%ROWTYPE;
BEGIN
  IF v_auth_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT employee_id
  INTO v_employee_id
  FROM public.profiles
  WHERE id = v_auth_id
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT * INTO v_ctrl
  FROM public.employee_session_controls
  WHERE employee_id = v_employee_id;

  IF v_ctrl.employee_id IS NULL OR v_ctrl.force_logout_after IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  IF p_session_issued_at IS NULL THEN
    RETURN QUERY SELECT true, COALESCE(v_ctrl.force_logout_reason, 'SESSION_REVOKED'), v_ctrl.force_logout_after;
    RETURN;
  END IF;

  IF v_ctrl.force_logout_after > p_session_issued_at THEN
    RETURN QUERY SELECT true, COALESCE(v_ctrl.force_logout_reason, 'SESSION_REVOKED'), v_ctrl.force_logout_after;
  ELSE
    RETURN QUERY SELECT false, NULL::text, v_ctrl.force_logout_after;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.force_logout_employee_sessions(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_my_session_revoked(timestamptz) TO authenticated;
