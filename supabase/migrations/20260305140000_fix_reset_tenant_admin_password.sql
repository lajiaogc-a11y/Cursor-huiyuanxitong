-- 修复 reset_tenant_admin_password：当 admin_employee_id 为空时，自动查找该租户下的管理员
-- 解决租户管理员密码重置失败的问题
DROP FUNCTION IF EXISTS public.reset_tenant_admin_password(uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.reset_tenant_admin_password(
  p_tenant_id uuid,
  p_admin_employee_id uuid DEFAULT NULL,
  p_new_password text DEFAULT NULL
)
RETURNS TABLE(success boolean, error_code text, admin_employee_id uuid, admin_username text, admin_real_name text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_emp_id uuid;
  v_username text;
  v_real_name text;
BEGIN
  -- 权限：仅平台超级管理员
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN QUERY SELECT false, 'NO_PERMISSION'::text, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- 优先使用传入的 admin_employee_id，否则从 tenants 表获取，再否则查找该租户下任意 admin 角色员工
  v_emp_id := COALESCE(
    p_admin_employee_id,
    (SELECT t.admin_employee_id FROM public.tenants t WHERE t.id = p_tenant_id LIMIT 1),
    (SELECT e.id FROM public.employees e WHERE e.tenant_id = p_tenant_id AND e.role = 'admin' ORDER BY e.created_at LIMIT 1)
  );

  IF v_emp_id IS NULL THEN
    RETURN QUERY SELECT false, 'ADMIN_NOT_FOUND'::text, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  IF p_new_password IS NULL OR trim(p_new_password) = '' THEN
    RETURN QUERY SELECT false, 'INVALID_PASSWORD'::text, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT e.username, e.real_name INTO v_username, v_real_name FROM public.employees e WHERE e.id = v_emp_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'ADMIN_NOT_FOUND'::text, NULL::uuid, NULL::text, NULL::text;
    RETURN;
  END IF;

  -- 更新密码
  UPDATE public.employees
  SET password_hash = extensions.crypt(trim(p_new_password), extensions.gen_salt('bf')),
      updated_at = now()
  WHERE id = v_emp_id;

  -- 若 tenants.admin_employee_id 为空，顺便更新
  UPDATE public.tenants
  SET admin_employee_id = v_emp_id, updated_at = now()
  WHERE id = p_tenant_id AND admin_employee_id IS NULL;

  RETURN QUERY SELECT true, NULL::text, v_emp_id, v_username, v_real_name;
END;
$fn$;
