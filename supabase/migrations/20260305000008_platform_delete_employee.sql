-- 平台总管理员可删除任意员工（含租户总管理员、管理员）
-- 用于修复「总管理账号不可以删除其它管理员」问题

CREATE OR REPLACE FUNCTION public.platform_delete_employee(p_employee_id uuid)
RETURNS TABLE(success boolean, error_code text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
declare
  v_target_tenant_id uuid;
begin
  -- 仅平台总管理员可调用
  if not public.is_platform_super_admin(auth.uid()) then
    return query select false, 'NO_PERMISSION'::text;
    return;
  end if;

  -- 检查目标员工是否存在
  if not exists (select 1 from employees where id = p_employee_id) then
    return query select false, 'EMPLOYEE_NOT_FOUND'::text;
    return;
  end if;

  -- 解除 profiles 对目标员工的引用
  update profiles set employee_id = null where employee_id = p_employee_id;

  -- 解除 tenants 对目标员工的引用（若该员工是某租户的 admin_employee_id）
  update tenants set admin_employee_id = null where admin_employee_id = p_employee_id;

  -- 删除员工
  delete from employees where id = p_employee_id;

  return query select true, null::text;
exception when others then
  return query select false, 'DELETE_FAILED'::text;
end;
$fn$;
