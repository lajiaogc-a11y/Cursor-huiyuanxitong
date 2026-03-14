const pg = require("pg");
require("dotenv").config();
const url = process.env.DATABASE_URL || ("postgresql://postgres:" + encodeURIComponent(process.env.DATABASE_PASSWORD || "") + "@db.dhlwefrcowefvbxutsmc.supabase.co:5432/postgres");

(async () => {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  const q = async (sql) => {
    const r = await c.query(sql);
    console.log("\n--- " + sql.replace(/\s+/g, " ").trim().slice(0, 120) + " ---");
    console.table(r.rows);
  };

  await q("select count(*)::int as members_total, count(*) filter (where tenant_id is null)::int as members_tenant_null from public.members");
  await q("select tenant_id, count(*)::int as member_count from public.members group by tenant_id order by member_count desc nulls last limit 10");
  await q("select tenant_id, company_name, logo_url, welcome_title, welcome_subtitle, updated_at from public.member_portal_settings order by updated_at desc limit 10");
  await q("select tenant_id, max(version_no)::int as max_version, max(created_at) as latest_version_time, bool_or(is_applied) as has_applied from public.member_portal_settings_versions group by tenant_id order by latest_version_time desc limit 10");
  await q("select id, phone_number, member_code, tenant_id, creator_id, recorder_id, created_at from public.members where phone_number='11111111' or member_code='11111111' limit 5");

  await c.end();
})();
