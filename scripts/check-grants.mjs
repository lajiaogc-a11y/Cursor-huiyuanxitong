import pg from 'pg';
const c = new pg.Client({
  host: 'db.dhlwefrcowefvbxutsmc.supabase.co',
  port: 5432, database: 'postgres', user: 'postgres',
  password: 'AE2n91Qs6MBxCEAZ', ssl: { rejectUnauthorized: false }
});
await c.connect();
// Check grants for anon role
const r = await c.query(`
  SELECT grantee, privilege_type 
  FROM information_schema.routine_privileges 
  WHERE routine_schema = 'public' 
  AND routine_name = 'verify_member_password'
  AND grantee IN ('anon','authenticated','public')
`);
console.log('Grants for verify_member_password:');
r.rows.forEach(x => console.log(`  ${x.grantee}: ${x.privilege_type}`));
if (r.rows.length === 0) {
  console.log('  (no grants found for anon/authenticated/public)');
  // Grant it
  console.log('\nGranting EXECUTE to anon and authenticated...');
  await c.query(`GRANT EXECUTE ON FUNCTION public.verify_member_password(text, text) TO anon, authenticated`);
  console.log('Done!');
}
await c.end();
