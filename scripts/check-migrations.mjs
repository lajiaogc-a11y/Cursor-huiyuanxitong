import pg from 'pg';
const { Client } = pg;
const c = new Client({
  host: 'db.dhlwefrcowefvbxutsmc.supabase.co',
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'AE2n91Qs6MBxCEAZ',
  ssl: { rejectUnauthorized: false }
});
await c.connect();
const r = await c.query(`SELECT name FROM supabase_migrations.schema_migrations ORDER BY name DESC LIMIT 30`);
r.rows.forEach(x => console.log(x.name));
await c.end();
