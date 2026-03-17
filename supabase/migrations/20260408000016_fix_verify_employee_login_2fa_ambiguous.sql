-- Fix: column reference "employee_id" is ambiguous in verify_employee_login_2fa
-- RETURNS TABLE 的 employee_id 与表列 employee_id 冲突，使用表别名消除歧义
CREATE OR REPLACE FUNCTION public.verify_employee_login_2fa(
  p_username text,
  p_code text DEFAULT NULL
)
RETURNS TABLE(success boolean, message text, employee_id uuid, required boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_employee public.employees%ROWTYPE;
  v_setting public.employee_login_2fa_settings%ROWTYPE;
  v_code text := trim(COALESCE(p_code, ''));
BEGIN
  SELECT * INTO v_employee
  FROM public.employees
  WHERE username = trim(COALESCE(p_username, ''))
  LIMIT 1;

  IF v_employee.id IS NULL THEN
    RETURN QUERY SELECT false, 'USER_NOT_FOUND', NULL::uuid, false;
    RETURN;
  END IF;

  SELECT s.* INTO v_setting
  FROM public.employee_login_2fa_settings s
  WHERE s.employee_id = v_employee.id
  LIMIT 1;

  IF v_setting.employee_id IS NULL OR v_setting.enabled = false THEN
    RETURN QUERY SELECT true, 'NOT_REQUIRED', v_employee.id, false;
    RETURN;
  END IF;

  IF v_code = '' THEN
    RETURN QUERY SELECT false, 'TWO_FACTOR_REQUIRED', v_employee.id, true;
    RETURN;
  END IF;

  IF COALESCE(v_setting.code_hash, '') = '' THEN
    RETURN QUERY SELECT false, 'TWO_FACTOR_NOT_CONFIGURED', v_employee.id, true;
    RETURN;
  END IF;

  IF crypt(v_code, v_setting.code_hash) = v_setting.code_hash THEN
    RETURN QUERY SELECT true, 'OK', v_employee.id, true;
  ELSE
    RETURN QUERY SELECT false, 'WRONG_2FA_CODE', v_employee.id, true;
  END IF;
END;
$$;
