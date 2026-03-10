-- Fix verify_employee_login_detailed to return employee_id instead of id
CREATE OR REPLACE FUNCTION public.verify_employee_login_detailed(p_username text, p_password text)
RETURNS TABLE (
  employee_id uuid,
  username text,
  real_name text,
  role public.app_role,
  status text,
  error_code text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee RECORD;
BEGIN
  SELECT e.id, e.username, e.real_name, e.role, e.status, e.password_hash
  INTO v_employee
  FROM public.employees e
  WHERE e.username = p_username;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::public.app_role, NULL::text, 'USER_NOT_FOUND'::text;
    RETURN;
  END IF;

  IF v_employee.status != 'active' AND v_employee.status != 'pending' THEN
    RETURN QUERY SELECT v_employee.id, v_employee.username, v_employee.real_name, v_employee.role, v_employee.status, 'ACCOUNT_DISABLED'::text;
    RETURN;
  END IF;

  IF (v_employee.password_hash LIKE '$2%' AND v_employee.password_hash = extensions.crypt(p_password, v_employee.password_hash))
     OR (v_employee.password_hash NOT LIKE '$2%' AND v_employee.password_hash = p_password) THEN
    -- Return employee_id (mapped from id) instead of just id
    RETURN QUERY SELECT v_employee.id AS employee_id, v_employee.username, v_employee.real_name, v_employee.role, v_employee.status, NULL::text;
  ELSE
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::public.app_role, NULL::text, 'WRONG_PASSWORD'::text;
  END IF;
END;
$$;