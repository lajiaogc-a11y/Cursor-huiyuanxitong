import pg from 'pg';
const c = new pg.Client({
  host: 'db.dhlwefrcowefvbxutsmc.supabase.co',
  port: 5432, database: 'postgres', user: 'postgres',
  password: 'AE2n91Qs6MBxCEAZ', ssl: { rejectUnauthorized: false }
});
await c.connect();

// Check if function exists
const fn = await c.query(`
  SELECT routine_name, data_type FROM information_schema.routines 
  WHERE routine_schema = 'public' AND routine_name LIKE 'verify_employee_login%'
`);
console.log('Functions:');
fn.rows.forEach(x => console.log(`  ${x.routine_name} -> ${x.data_type}`));

// Check grants
const gr = await c.query(`
  SELECT grantee, privilege_type FROM information_schema.routine_privileges 
  WHERE routine_schema = 'public' AND routine_name LIKE 'verify_employee_login%'
  AND grantee IN ('anon','authenticated','public')
`);
console.log('\nGrants:');
gr.rows.forEach(x => console.log(`  ${x.grantee}: ${x.privilege_type}`));

if (gr.rows.length === 0) {
  console.log('\n  No grants found! Granting...');
  // Find exact function signature
  const sig = await c.query(`
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname LIKE 'verify_employee_login%'
  `);
  for (const s of sig.rows) {
    const sql = `GRANT EXECUTE ON FUNCTION public.${s.proname}(${s.args}) TO anon, authenticated`;
    console.log(`  ${sql}`);
    await c.query(sql);
  }
  console.log('  Done!');
}

await c.end();
