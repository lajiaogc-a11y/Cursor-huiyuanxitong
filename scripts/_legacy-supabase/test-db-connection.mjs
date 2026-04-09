import pg from 'pg';

const password = (process.env.DATABASE_PASSWORD || '').trim();
if (!password) {
  console.error('❌ 需要 DATABASE_PASSWORD 环境变量');
  process.exit(1);
}

const projectRef = process.env.VITE_SUPABASE_PROJECT_ID || 'aoyvgvecvxfwgrmngnrc';
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`,
  ssl: { rejectUnauthorized: false },
});

try {
  const tablesRes = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);
  console.log(`\n=== public schema: ${tablesRes.rows.length} tables ===`);
  console.log(tablesRes.rows.map(r => r.tablename).join('\n'));

  const rpcRes = await pool.query(`SELECT routine_name FROM information_schema.routines WHERE routine_schema='public' AND routine_type='FUNCTION' ORDER BY routine_name`);
  console.log(`\n=== public functions: ${rpcRes.rows.length} ===`);
  const critical = ['verify_employee_login_detailed', 'signup_employee', 'verify_member_password', 'set_member_password', 'log_employee_login', 'check_employee_login_lock'];
  for (const fn of critical) {
    const found = rpcRes.rows.some(r => r.routine_name === fn);
    console.log(`  ${found ? 'OK' : 'MISSING'}: ${fn}`);
  }

  const empRes = await pool.query(`SELECT COUNT(*)::int as c FROM employees`).catch(() => ({ rows: [{ c: 'TABLE NOT FOUND' }] }));
  console.log(`\n=== employees count: ${empRes.rows[0].c} ===`);

  const tenantRes = await pool.query(`SELECT COUNT(*)::int as c FROM tenants`).catch(() => ({ rows: [{ c: 'TABLE NOT FOUND' }] }));
  console.log(`=== tenants count: ${tenantRes.rows[0].c} ===`);

  const memberRes = await pool.query(`SELECT COUNT(*)::int as c FROM members`).catch(() => ({ rows: [{ c: 'TABLE NOT FOUND' }] }));
  console.log(`=== members count: ${memberRes.rows[0].c} ===`);

  const orderRes = await pool.query(`SELECT COUNT(*)::int as c FROM orders`).catch(() => ({ rows: [{ c: 'TABLE NOT FOUND' }] }));
  console.log(`=== orders count: ${orderRes.rows[0].c} ===`);

} catch (e) {
  console.error('CONNECTION ERROR:', e.message);
} finally {
  await pool.end();
}
