import pg from "pg";
import dotenv from "dotenv";
dotenv.config();
const url = process.env.DATABASE_URL || ("postgresql://postgres:" + encodeURIComponent(process.env.DATABASE_PASSWORD || "") + "@db.dhlwefrcowefvbxutsmc.supabase.co:5432/postgres");
const PLATFORM = "ed5d556a-8902-4a91-aff1-a417b5d00d99";
const FASTGC = "05307a8c-68f5-4fe4-a212-06439387dbd1";

const c = new pg.Client({ connectionString: url });
await c.connect();

const tbl = await c.query(`
  select table_schema, table_name
  from information_schema.columns
  where column_name='tenant_id' and table_schema='public'
  group by table_schema, table_name
  order by table_name
`);

const rows = [];
for (const t of tbl.rows) {
  const full = `public.${t.table_name}`;
  const q = `select
    count(*) filter (where tenant_id = $1)::int as platform_count,
    count(*) filter (where tenant_id = $2)::int as fastgc_count,
    count(*)::int as total_count
    from ${full}`;
  const r = await c.query(q, [PLATFORM, FASTGC]);
  rows.push({ table: t.table_name, ...r.rows[0] });
}
console.table(rows);
await c.end();
