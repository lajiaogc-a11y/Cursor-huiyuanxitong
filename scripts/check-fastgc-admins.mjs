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

const t002 = (await c.query(`SELECT id FROM public.tenants WHERE tenant_code='002'`)).rows[0]?.id;

// All employees in FastGC with role
const emps = await c.query(`
  SELECT username, real_name, role, is_super_admin, status
  FROM public.employees
  WHERE tenant_id = $1
  ORDER BY role, username
`, [t002]);

console.log("=== FastGC (002) EMPLOYEES ===");
for (const e of emps.rows) {
  console.log(`  ${e.username} (${e.real_name}) - role=${e.role} super=${e.is_super_admin} status=${e.status}`);
}

// Count admins
const adminCount = emps.rows.filter(e => e.role === 'admin').length;
console.log(`\nTotal admins: ${adminCount}`);
console.log(`Total managers: ${emps.rows.filter(e => e.role === 'manager').length}`);
console.log(`Total staff: ${emps.rows.filter(e => e.role === 'staff').length}`);

await c.end();
