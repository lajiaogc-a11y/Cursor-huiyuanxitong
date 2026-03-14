import pg from "pg";
import dotenv from "dotenv";
dotenv.config();
const url = process.env.DATABASE_URL || ("postgresql://postgres:" + encodeURIComponent(process.env.DATABASE_PASSWORD || "") + "@db.dhlwefrcowefvbxutsmc.supabase.co:5432/postgres");
const c = new pg.Client({ connectionString: url });
await c.connect();

const memberId = "55370256-a40f-40ac-8f39-4545a44ec57d";
const r1 = await c.query("select public.member_get_portal_settings($1::uuid) as data", [memberId]);
console.log("member_get_portal_settings:");
console.log(JSON.stringify(r1.rows[0].data, null, 2));

const r2 = await c.query("select public.member_get_portal_settings_by_account($1::text) as data", ["11111111"]);
console.log("\nmember_get_portal_settings_by_account:");
console.log(JSON.stringify(r2.rows[0].data, null, 2));

await c.end();
