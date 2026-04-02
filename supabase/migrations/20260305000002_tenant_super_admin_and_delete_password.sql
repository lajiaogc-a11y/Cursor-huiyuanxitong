-- 1. 删除租户需验证密码：delete_tenant 增加 p_username, p_password 参数，验证通过后才执行删除
CREATE OR REPLACE FUNCTION public.delete_tenant(
  p_tenant_id uuid,
  p_force boolean DEFAULT false,
  p_username text DEFAULT NULL,
  p_password text DEFAULT NULL
)
RETURNS TABLE (success boolean, error_code text, detail text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
declare
  v_tenant_code text;
  v_data_count bigint := 0;
  v_tables_with_data text[] := '{}';
  v_tbl text;
  v_cnt bigint;
  v_verify record;
  v_username text;
begin
  -- Permission check: must be platform super admin
  if not public.is_platform_super_admin(auth.uid()) then
    return query select false, 'NO_PERMISSION'::text, null::text;
    return;
  end if;

  -- Password verification required
  if p_username is null or p_username = '' or p_password is null or p_password = '' then
    return query select false, 'PASSWORD_REQUIRED'::text, '删除租户需输入当前账号密码验证'::text;
    return;
  end if;

  -- Verify password via verify_employee_login_detailed
  select * into v_verify from public.verify_employee_login_detailed(p_username, p_password) limit 1;
  if not found or v_verify.error_code is not null then
    return query select false, 'INVALID_PASSWORD'::text, '密码错误'::text;
    return;
  end if;

  -- Ensure the verifying user is the current user (profile -> employee)
  select e.username into v_username from profiles p join employees e on e.id = p.employee_id where p.id = auth.uid() limit 1;
  if v_username is null or v_username != p_username then
    return query select false, 'USER_MISMATCH'::text, '只能验证当前登录账号的密码'::text;
    return;
  end if;

  -- Get tenant info
  select tenant_code into v_tenant_code from public.tenants where id = p_tenant_id;
  if v_tenant_code is null then
    return query select false, 'TENANT_NOT_FOUND'::text, null::text;
    return;
  end if;

  if v_tenant_code = 'platform' then
    return query select false, 'CANNOT_DELETE_PLATFORM'::text, null::text;
    return;
  end if;

  -- Check data in business tables
  for v_tbl in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'tenant_id'
      and table_name not in ('tenants', 'employees', 'navigation_config', 'role_permissions')
    order by table_name
  loop
    begin
      execute format('select count(*) from public.%I where tenant_id = $1', v_tbl) into v_cnt using p_tenant_id;
      if v_cnt > 0 then
        v_data_count := v_data_count + v_cnt;
        v_tables_with_data := v_tables_with_data || format('%s(%s)', v_tbl, v_cnt);
      end if;
    exception when others then
      null; -- skip tables that might not exist or have different schema
    end;
  end loop;

  if v_data_count > 0 and not p_force then
    return query select false, 'TENANT_HAS_DATA'::text,
      format('共 %s 条业务数据: %s', v_data_count, array_to_string(v_tables_with_data, ', '))::text;
    return;
  end if;

  -- Nullify profiles.employee_id for employees being deleted
  update public.profiles set employee_id = null
  where employee_id in (select id from public.employees where tenant_id = p_tenant_id);

  -- Delete from tenant-scoped tables
  for v_tbl in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'tenant_id'
      and table_name != 'tenants'
    order by table_name
  loop
    begin
      execute format('delete from public.%I where tenant_id = $1', v_tbl) using p_tenant_id;
    exception when others then
      raise notice 'Failed to delete from %: %', v_tbl, SQLERRM;
    end;
  end loop;

  delete from public.tenants where id = p_tenant_id;
  return query select true, null::text, null::text;

exception when others then
  return query select false, 'DELETE_FAILED'::text, SQLERRM::text;
end;
$fn$;

-- 2. 设定租户总管理员：每个租户只能有一个总管理员。仅平台总管理员可设定。
CREATE OR REPLACE FUNCTION public.set_tenant_super_admin(p_employee_id uuid)
RETURNS TABLE (success boolean, error_code text)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
declare
  v_target_tenant_id uuid;
begin
  -- Only platform super admin can set tenant super admin
  if not public.is_platform_super_admin(auth.uid()) then
    return query select false, 'NO_PERMISSION'::text;
    return;
  end if;

  -- Get target employee's tenant_id
  select tenant_id into v_target_tenant_id from employees where id = p_employee_id limit 1;
  if v_target_tenant_id is null then
    return query select false, 'EMPLOYEE_NOT_FOUND'::text;
    return;
  end if;

  -- Clear other super admins in same tenant (each tenant has only one super admin)
  update employees set is_super_admin = false
  where tenant_id = v_target_tenant_id and id != p_employee_id;

  -- Set target as super admin
  update employees set is_super_admin = true where id = p_employee_id;

  return query select true, null::text;
exception when others then
  return query select false, 'UPDATE_FAILED'::text;
end;
$fn$;
