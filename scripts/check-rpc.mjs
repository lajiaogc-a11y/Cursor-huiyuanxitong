import pg from 'pg';
const c = new pg.Client({
  host: 'db.dhlwefrcowefvbxutsmc.supabase.co',
  port: 5432, database: 'postgres', user: 'postgres',
  password: 'AE2n91Qs6MBxCEAZ', ssl: { rejectUnauthorized: false }
});
await c.connect();
const r = await c.query(`
  SELECT routine_name FROM information_schema.routines 
  WHERE routine_schema = 'public' 
  AND routine_name IN ('verify_member_password','member_get_info','set_member_password','member_get_default_portal_settings','member_get_portal_settings_by_account')
  ORDER BY routine_name
`);
r.rows.forEach(x => console.log(x.routine_name));
if (r.rows.length === 0) console.log('(no matching functions found)');
await c.end();
