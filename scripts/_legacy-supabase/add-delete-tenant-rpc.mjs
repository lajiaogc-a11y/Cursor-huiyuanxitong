import pg from "pg";
const c = new pg.Client({
  host: "db.dhlwefrcowefvbxutsmc.supabase.co",
  port: 5432,
  database: "postgres",
  user: "postgres",
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});
await c.connect();

// Create delete_tenant RPC
await c.query(`
CREATE OR REPLACE FUNCTION public.delete_tenant(
  p_tenant_id uuid,
  p_force boolean DEFAULT false
)
RETURNS TABLE (success boolean, error_code text, detail text)
LANGUAGE plpgsql SECURITY DEFINER
AS $fn$
declare
  v_tenant_code text;
  v_data_count bigint := 0;
  v_tables_with_data text[] := '{}';
  v_tbl text;
  v_cnt bigint;
begin
  -- Permission check
  if not public.is_platform_super_admin(auth.uid()) then
    return query select false, 'NO_PERMISSION'::text, null::text;
    return;
  end if;

  -- Get tenant info
  select tenant_code into v_tenant_code
  from public.tenants where id = p_tenant_id;

  if v_tenant_code is null then
    return query select false, 'TENANT_NOT_FOUND'::text, null::text;
    return;
  end if;

  -- Cannot delete platform tenant
  if v_tenant_code = 'platform' then
    return query select false, 'CANNOT_DELETE_PLATFORM'::text, null::text;
    return;
  end if;

  -- Check data in business tables
  for v_tbl in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'tenant_id'
      and table_name not in ('tenants', 'employees', 'role_permissions')
    order by table_name
  loop
    execute format('select count(*) from public.%I where tenant_id = $1', v_tbl)
      into v_cnt using p_tenant_id;
    if v_cnt > 0 then
      v_data_count := v_data_count + v_cnt;
      v_tables_with_data := v_tables_with_data || format('%s(%s)', v_tbl, v_cnt);
    end if;
  end loop;

  -- If has data and not force, reject
  if v_data_count > 0 and not p_force then
    return query select false, 'TENANT_HAS_DATA'::text,
      format('共 %s 条业务数据: %s', v_data_count, array_to_string(v_tables_with_data, ', '))::text;
    return;
  end if;

  -- Delete all data in reverse dependency order
  -- First nullify foreign key references in profiles
  update public.profiles set employee_id = null
  where employee_id in (select id from public.employees where tenant_id = p_tenant_id);

  -- Delete from all tenant-scoped tables (except tenants itself)
  for v_tbl in
    select table_name from information_schema.columns
    where table_schema = 'public' and column_name = 'tenant_id'
      and table_name != 'tenants'
    order by table_name
  loop
    execute format('delete from public.%I where tenant_id = $1', v_tbl) using p_tenant_id;
  end loop;

  -- Delete the tenant itself
  delete from public.tenants where id = p_tenant_id;

  return query select true, null::text, null::text;

exception when others then
  return query select false, 'DELETE_FAILED'::text, SQLERRM::text;
end;
$fn$;
`);
console.log("1. Created delete_tenant RPC");

await c.query(`NOTIFY pgrst, 'reload schema'`);
console.log("2. Schema cache reloaded");

await c.end();
