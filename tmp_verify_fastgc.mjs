import pg from "pg";
import dotenv from "dotenv";
dotenv.config();
const url = process.env.DATABASE_URL || ("postgresql://postgres:" + encodeURIComponent(process.env.DATABASE_PASSWORD || "") + "@db.dhlwefrcowefvbxutsmc.supabase.co:5432/postgres");
const PLATFORM = "ed5d556a-8902-4a91-aff1-a417b5d00d99";
const FASTGC = "05307a8c-68f5-4fe4-a212-06439387dbd1";
const c = new pg.Client({ connectionString: url });
await c.connect();

const q1 = await c.query("select count(*)::int as members_total, count(*) filter (where tenant_id=$1)::int as platform_count, count(*) filter (where tenant_id=$2)::int as fastgc_count from public.members", [PLATFORM, FASTGC]);
console.log("members counts:"); console.table(q1.rows);

const q2 = await c.query("select count(*)::int as activity_total, count(*) filter (where tenant_id=$1)::int as platform_count, count(*) filter (where tenant_id=$2)::int as fastgc_count from public.member_activity", [PLATFORM, FASTGC]);
console.log("member_activity counts:"); console.table(q2.rows);

const q3 = await c.query("select id, phone_number, member_code, tenant_id from public.members where phone_number='11111111' or member_code='11111111'");
console.log("member 11111111:"); console.table(q3.rows);

const q4 = await c.query("select public.member_get_portal_settings_by_account('11111111') as data");
console.log("portal by account 11111111:");
console.log(JSON.stringify(q4.rows[0].data, null, 2));

await c.end();
