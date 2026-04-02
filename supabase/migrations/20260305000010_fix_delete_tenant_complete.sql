-- 彻底修复删除租户：先解除/删除所有对 employees 的引用，再删除 employees，最后删除 tenants
-- 原因：employees 被 operation_logs、orders、members 等大量表引用，直接 delete employees 会触发 FK 错误

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

  -- Check data in business tables (tables with tenant_id)
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
      null;
    end;
  end loop;

  if v_data_count > 0 and not p_force then
    return query select false, 'TENANT_HAS_DATA'::text,
      format('共 %s 条业务数据: %s', v_data_count, array_to_string(v_tables_with_data, ', '))::text;
    return;
  end if;

  -- ========== 第一步：解除 tenants 对 employees 的引用 ==========
  update public.tenants set admin_employee_id = null where id = p_tenant_id;

  -- ========== 第二步：解除 profiles 对 employees 的引用 ==========
  update public.profiles set employee_id = null
  where employee_id in (select id from public.employees where tenant_id = p_tenant_id);

  -- ========== 第三步：删除/置空所有引用该租户 employees 的数据（按 FK 依赖顺序）==========
  -- operation_logs: 删除 operator_id 为该租户员工的记录
  delete from public.operation_logs
  where operator_id in (select id from public.employees where tenant_id = p_tenant_id);
  -- operation_logs: 置空 restored_by
  update public.operation_logs set restored_by = null
  where restored_by in (select id from public.employees where tenant_id = p_tenant_id);

  -- activity_gifts
  delete from public.activity_gifts
  where creator_id in (select id from public.employees where tenant_id = p_tenant_id);

  -- audit_records: 置空引用
  update public.audit_records set reviewer_id = null
  where reviewer_id in (select id from public.employees where tenant_id = p_tenant_id);
  update public.audit_records set submitter_id = null
  where submitter_id in (select id from public.employees where tenant_id = p_tenant_id);

  -- employee_name_history: changed_by 置空（employee_id 有 CASCADE）
  update public.employee_name_history set changed_by = null
  where changed_by in (select id from public.employees where tenant_id = p_tenant_id);

  -- members: 删除由该租户员工创建/录制的会员
  delete from public.members
  where creator_id in (select id from public.employees where tenant_id = p_tenant_id)
     or recorder_id in (select id from public.employees where tenant_id = p_tenant_id);

  -- orders: 删除由该租户员工创建/销售的订单
  delete from public.orders
  where creator_id in (select id from public.employees where tenant_id = p_tenant_id)
     or sales_user_id in (select id from public.employees where tenant_id = p_tenant_id);

  -- points_ledger
  delete from public.points_ledger
  where creator_id in (select id from public.employees where tenant_id = p_tenant_id);

  -- balance_change_logs / ledger_transactions（若有 operator_id 引用 employees）
  begin
    update public.balance_change_logs set operator_id = null
    where operator_id in (select id from public.employees where tenant_id = p_tenant_id);
  exception when undefined_table then null; when others then null;
  end;
  begin
    update public.ledger_transactions set operator_id = null
    where operator_id in (select id from public.employees where tenant_id = p_tenant_id);
  exception when undefined_table then null; when others then null;
  end;

  -- 其他可能引用 employees 的表（若存在则处理）
  begin
    delete from public.api_keys where created_by in (select id from public.employees where tenant_id = p_tenant_id);
  exception when undefined_table then null; when others then null;
  end;
  begin
    delete from public.data_backups where created_by in (select id from public.employees where tenant_id = p_tenant_id);
  exception when undefined_table then null; when others then null;
  end;
  begin
    update public.invitation_codes set created_by = null where created_by in (select id from public.employees where tenant_id = p_tenant_id);
  exception when undefined_table then null; when others then null;
  end;
  begin
    update public.knowledge_articles set created_by = null where created_by in (select id from public.employees where tenant_id = p_tenant_id);
  exception when undefined_table then null; when others then null;
  end;
  begin
    update public.knowledge_categories set created_by = null where created_by in (select id from public.employees where tenant_id = p_tenant_id);
  exception when undefined_table then null; when others then null;
  end;
  begin
    delete from public.permission_change_logs where changed_by in (select id from public.employees where tenant_id = p_tenant_id);
  exception when undefined_table then null; when others then null;
  end;
  begin
    update public.permission_versions set created_by = null where created_by in (select id from public.employees where tenant_id = p_tenant_id);
  exception when undefined_table then null; when others then null;
  end;
  begin
    delete from public.risk_events where employee_id in (select id from public.employees where tenant_id = p_tenant_id)
       or resolved_by in (select id from public.employees where tenant_id = p_tenant_id);
  exception when undefined_table then null; when others then null;
  end;
  begin
    delete from public.risk_scores where employee_id in (select id from public.employees where tenant_id = p_tenant_id);
  exception when undefined_table then null; when others then null;
  end;
  begin
    delete from public.shift_handovers where handover_employee_id in (select id from public.employees where tenant_id = p_tenant_id);
  exception when undefined_table then null; when others then null;
  end;
  begin
    delete from public.shift_receivers where creator_id in (select id from public.employees where tenant_id = p_tenant_id);
  exception when undefined_table then null; when others then null;
  end;
  begin
    update public.webhooks set created_by = null where created_by in (select id from public.employees where tenant_id = p_tenant_id);
  exception when undefined_table then null; when others then null;
  end;

  -- ========== 第四步：删除该租户的 employees（CASCADE 会自动删除 employee_login_logs, employee_permissions, employee_name_history, knowledge_read_status）==========
  delete from public.employees where tenant_id = p_tenant_id;

  -- ========== 第五步：删除其他带 tenant_id 的表 ==========
  for v_tbl in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'tenant_id'
      and table_name not in ('tenants', 'employees')
    order by table_name
  loop
    begin
      execute format('delete from public.%I where tenant_id = $1', v_tbl) using p_tenant_id;
    exception when others then
      raise notice 'Failed to delete from %: %', v_tbl, SQLERRM;
    end;
  end loop;

  -- ========== 第六步：删除租户 ==========
  delete from public.tenants where id = p_tenant_id;
  return query select true, null::text, null::text;

exception when others then
  return query select false, 'DELETE_FAILED'::text, SQLERRM::text;
end;
$fn$;
