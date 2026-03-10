-- 修复删除租户时 points_ledger_order_id_fkey 外键约束错误
-- 错误：update or delete on table "orders" violates foreign key constraint "points_ledger_order_id_fkey"
-- 原因：删除 orders 前需先删除引用这些订单的 points_ledger（points_ledger.order_id -> orders.id）

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
  v_member_ids uuid[];
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
  -- operation_logs
  delete from public.operation_logs
  where operator_id in (select id from public.employees where tenant_id = p_tenant_id);
  update public.operation_logs set restored_by = null
  where restored_by in (select id from public.employees where tenant_id = p_tenant_id);

  -- activity_gifts
  delete from public.activity_gifts
  where creator_id in (select id from public.employees where tenant_id = p_tenant_id);

  -- audit_records
  update public.audit_records set reviewer_id = null
  where reviewer_id in (select id from public.employees where tenant_id = p_tenant_id);
  update public.audit_records set submitter_id = null
  where submitter_id in (select id from public.employees where tenant_id = p_tenant_id);

  -- employee_name_history
  update public.employee_name_history set changed_by = null
  where changed_by in (select id from public.employees where tenant_id = p_tenant_id);

  -- points_ledger: 必须先删除引用该租户订单的积分记录（order_id -> orders），否则删除 orders 会违反 points_ledger_order_id_fkey
  delete from public.points_ledger
  where order_id in (
    select o.id from public.orders o
    where o.creator_id in (select id from public.employees where tenant_id = p_tenant_id)
       or o.sales_user_id in (select id from public.employees where tenant_id = p_tenant_id)
  );

  -- orders: 删除该租户的订单（避免后续 members 删除时 orders.member_id FK 冲突）
  delete from public.orders
  where creator_id in (select id from public.employees where tenant_id = p_tenant_id)
     or sales_user_id in (select id from public.employees where tenant_id = p_tenant_id);

  -- 获取即将删除的 member ids（creator_id 或 recorder_id 属于该租户员工）
  select array_agg(id) into v_member_ids from public.members
  where creator_id in (select id from public.employees where tenant_id = p_tenant_id)
     or recorder_id in (select id from public.employees where tenant_id = p_tenant_id);

  -- 在删除 members 之前，先删除/解除所有引用这些 members 的数据
  if v_member_ids is not null and array_length(v_member_ids, 1) > 0 then
    -- member_activity: 必须先删除（member_activity_member_id_fkey）
    delete from public.member_activity where member_id = any(v_member_ids);

    -- activity_gifts: 按 member_id 删除
    delete from public.activity_gifts where member_id = any(v_member_ids);

    -- points_ledger: 按 member_id 删除或置空
    delete from public.points_ledger where member_id = any(v_member_ids);

    -- referral_relations 使用 member_code 非 member_id，无 FK 约束，无需在此处理

    -- orders: 解除 member_id 引用（其他租户的订单可能引用这些会员）
    update public.orders set member_id = null where member_id = any(v_member_ids);
  end if;

  -- members: 删除由该租户员工创建/录制的会员
  delete from public.members
  where creator_id in (select id from public.employees where tenant_id = p_tenant_id)
     or recorder_id in (select id from public.employees where tenant_id = p_tenant_id);

  -- points_ledger（按 creator_id，与上面 member_id 不重复）
  delete from public.points_ledger
  where creator_id in (select id from public.employees where tenant_id = p_tenant_id);

  -- balance_change_logs / ledger_transactions
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

  -- 其他可能引用 employees 的表
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

  -- ========== 第四步：删除该租户的 employees ==========
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
