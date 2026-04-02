-- 修复：设为总管理员时同步更新 tenants.admin_employee_id，使租户列表能正确显示管理员账号/姓名
-- 原因：set_tenant_super_admin 仅设置了 employees.is_super_admin，未更新 tenants.admin_employee_id
-- list_tenants_for_platform_admin 通过 admin_employee_id 关联显示管理员，导致显示为 -

-- 1. 回填：对已设定总管理员但 admin_employee_id 为空的租户，从 is_super_admin 员工补全
UPDATE public.tenants t
SET admin_employee_id = e.id, updated_at = now()
FROM public.employees e
WHERE e.tenant_id = t.id
  AND e.is_super_admin = true
  AND t.admin_employee_id IS NULL
  AND t.tenant_code != 'platform';

-- 2. 修复 set_tenant_super_admin 函数：设为总管理员时同步更新 admin_employee_id
CREATE OR REPLACE FUNCTION public.set_tenant_super_admin(p_employee_id uuid)
RETURNS TABLE (success boolean, error_code text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
declare
  v_target_tenant_id uuid;
begin
  if not public.is_platform_super_admin(auth.uid()) then
    return query select false, 'NO_PERMISSION'::text;
    return;
  end if;

  select tenant_id into v_target_tenant_id from employees where id = p_employee_id limit 1;
  if v_target_tenant_id is null then
    return query select false, 'EMPLOYEE_NOT_FOUND'::text;
    return;
  end if;

  -- Clear other super admins in same tenant
  update employees set is_super_admin = false
  where tenant_id = v_target_tenant_id and id != p_employee_id;

  -- Set target as super admin
  update employees set is_super_admin = true where id = p_employee_id;

  -- 同步更新 tenants.admin_employee_id，使租户列表能显示管理员账号/姓名
  update public.tenants set admin_employee_id = p_employee_id, updated_at = now()
  where id = v_target_tenant_id;

  return query select true, null::text;
exception when others then
  return query select false, 'UPDATE_FAILED'::text;
end;
$fn$;
