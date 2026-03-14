import pg from "pg";
import dotenv from "dotenv";
dotenv.config();
const url = process.env.DATABASE_URL || ("postgresql://postgres:" + encodeURIComponent(process.env.DATABASE_PASSWORD || "") + "@db.dhlwefrcowefvbxutsmc.supabase.co:5432/postgres");
const c = new pg.Client({ connectionString: url });
await c.connect();

const queries = [
  ["租户列表(关键字段)", `select id, tenant_name, tenant_code, created_at from public.tenants order by created_at desc limit 20`],
  ["成员11111111", `select id, phone_number, member_code, tenant_id, creator_id, recorder_id, created_at from public.members where phone_number='11111111' or member_code='11111111'`],
  ["成员RTLCA96", `select id, phone_number, member_code, tenant_id, creator_id, recorder_id, created_at from public.members where member_code='RTLCA96'`],
  ["创建人员工", `select id, real_name, username, tenant_id, role, is_super_admin from public.employees where id='001e56ef-23fc-4ff8-855e-7df428394d1a'`],
  ["名字含wangchao的员工", `select id, real_name, username, tenant_id, role, is_super_admin from public.employees where lower(coalesce(real_name,'')) like '%wangchao%' or lower(coalesce(username,'')) like '%wangchao%' order by created_at desc limit 20`],
  ["门户配置归属", `select tenant_id, company_name, welcome_title, welcome_subtitle, updated_at from public.member_portal_settings order by updated_at desc limit 20`],
  ["11111111按账号取配置", `select public.member_get_portal_settings_by_account('11111111') as data`]
];

for (const [title, sql] of queries) {
  const r = await c.query(sql);
  console.log(`\n=== ${title} ===`);
  if (r.rows.length === 0) console.log('(empty)');
  else console.table(r.rows);
}

await c.end();
