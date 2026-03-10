
-- Fix verify_employee_login_detailed to support plaintext passwords with auto-upgrade to bcrypt.
-- This handles the case where employee password_hash was reset/imported as plaintext.
CREATE OR REPLACE FUNCTION public.verify_employee_login_detailed(p_username text, p_password text)
 RETURNS TABLE(employee_id uuid, username text, real_name text, role app_role, status text, is_super_admin boolean, error_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_employee RECORD;
BEGIN
  SELECT e.id, e.username, e.real_name, e.role, e.status, e.password_hash, e.is_super_admin
  INTO v_employee
  FROM public.employees e
  WHERE e.username = p_username;

  IF NOT FOUND THEN
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::public.app_role, NULL::text, NULL::boolean, 'USER_NOT_FOUND'::text;
    RETURN;
  END IF;

  IF v_employee.status != 'active' AND v_employee.status != 'pending' THEN
    RETURN QUERY SELECT v_employee.id, v_employee.username, v_employee.real_name, v_employee.role, v_employee.status, v_employee.is_super_admin, 'ACCOUNT_DISABLED'::text;
    RETURN;
  END IF;

  -- 优先：bcrypt 哈希校验
  IF v_employee.password_hash LIKE '$2%'
     AND v_employee.password_hash = extensions.crypt(p_password, v_employee.password_hash) THEN
    RETURN QUERY SELECT v_employee.id AS employee_id, v_employee.username, v_employee.real_name, v_employee.role, v_employee.status, v_employee.is_super_admin, NULL::text;

  -- 兜底：明文密码校验（自动升级为 bcrypt 哈希）
  ELSIF v_employee.password_hash IS NOT NULL
     AND v_employee.password_hash NOT LIKE '$2%'
     AND v_employee.password_hash = p_password THEN
    -- 自动将明文升级为 bcrypt
    UPDATE public.employees
    SET password_hash = extensions.crypt(p_password, extensions.gen_salt('bf'))
    WHERE id = v_employee.id;
    RETURN QUERY SELECT v_employee.id AS employee_id, v_employee.username, v_employee.real_name, v_employee.role, v_employee.status, v_employee.is_super_admin, NULL::text;

  ELSE
    RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, NULL::public.app_role, NULL::text, NULL::boolean, 'WRONG_PASSWORD'::text;
  END IF;
END;
$function$;

-- 同步修复 verify_employee_login（简单版本）
CREATE OR REPLACE FUNCTION public.verify_employee_login(p_username text, p_password text)
 RETURNS TABLE(employee_id uuid, username text, real_name text, role app_role, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT e.id, e.username, e.real_name, e.role, e.status
  FROM public.employees e
  WHERE e.username = p_username
    AND e.status = 'active'
    AND (
      (e.password_hash LIKE '$2%' AND e.password_hash = extensions.crypt(p_password, e.password_hash))
      OR
      (e.password_hash NOT LIKE '$2%' AND e.password_hash = p_password)
    );
END;
$function$;
