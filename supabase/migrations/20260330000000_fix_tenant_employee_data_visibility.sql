-- 1. verify_employee_login_detailed 增加 tenant_id 返回，供登录后立即设置 employee.tenant_id
DROP FUNCTION IF EXISTS public.verify_employee_login_detailed(text, text);
CREATE FUNCTION public.verify_employee_login_detailed(p_username text, p_password text)
 RETURNS TABLE(employee_id uuid, username text, real_name text, role app_role, status text, is_super_admin boolean, tenant_id uuid, error_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_employee RECORD;
BEGIN
  SELECT e.id, e.username, e.real_name, e.role, e.status, e.password_hash, e.is_super_admin, e.tenant_id
  INTO v_employee
  FROM public.employees e
  WHERE e.username = p_username;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::public.app_role, NULL::text, NULL::boolean, NULL::uuid, 'USER_NOT_FOUND'::text;
    RETURN;
  END IF;

  IF v_employee.status != 'active' AND v_employee.status != 'pending' THEN
    RETURN QUERY SELECT v_employee.id, v_employee.username, v_employee.real_name, v_employee.role, v_employee.status, v_employee.is_super_admin, v_employee.tenant_id, 'ACCOUNT_DISABLED'::text;
    RETURN;
  END IF;

  IF v_employee.password_hash LIKE '$2%'
     AND v_employee.password_hash = extensions.crypt(p_password, v_employee.password_hash) THEN
    RETURN QUERY SELECT v_employee.id AS employee_id, v_employee.username, v_employee.real_name, v_employee.role, v_employee.status, v_employee.is_super_admin, v_employee.tenant_id, NULL::text;

  ELSIF v_employee.password_hash IS NOT NULL
     AND v_employee.password_hash NOT LIKE '$2%'
     AND v_employee.password_hash = p_password THEN
    UPDATE public.employees
    SET password_hash = extensions.crypt(p_password, extensions.gen_salt('bf'))
    WHERE id = v_employee.id;
    RETURN QUERY SELECT v_employee.id AS employee_id, v_employee.username, v_employee.real_name, v_employee.role, v_employee.status, v_employee.is_super_admin, v_employee.tenant_id, NULL::text;

  ELSE
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::public.app_role, NULL::text, NULL::boolean, NULL::uuid, 'WRONG_PASSWORD'::text;
  END IF;
END;
$function$;
