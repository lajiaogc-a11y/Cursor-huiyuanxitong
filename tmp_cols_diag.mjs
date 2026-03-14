import pg from "pg";
import dotenv from "dotenv";
dotenv.config();
const url = process.env.DATABASE_URL || ("postgresql://postgres:" + encodeURIComponent(process.env.DATABASE_PASSWORD || "") + "@db.dhlwefrcowefvbxutsmc.supabase.co:5432/postgres");
const c = new pg.Client({ connectionString: url });
await c.connect();

const tables = ["members","member_activity","shared_data_store","navigation_config","operation_logs","employee_login_logs","role_permissions","employees"];
for (const t of tables) {
  const cols = await c.query(`select column_name from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`, [t]);
  console.log(`\n=== ${t} columns ===`);
  console.log(cols.rows.map(r=>r.column_name).join(", "));
}

await c.end();
