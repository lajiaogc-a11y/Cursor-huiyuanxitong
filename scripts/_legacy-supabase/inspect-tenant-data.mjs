#!/usr/bin/env node
import { readFileSync } from 'fs';
import { join } from 'path';
import pg from 'pg';

function loadEnv() {
  const envPath = join(process.cwd(), '.env');
  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#') || !t.includes('=')) continue;
    const i = t.indexOf('=');
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[k] = v;
  }
}

async function main() {
  loadEnv();
  const password = process.env.DATABASE_PASSWORD?.trim();
  if (!password) throw new Error('DATABASE_PASSWORD missing');

  const client = new pg.Client({
    connectionString: `postgresql://postgres:${encodeURIComponent(password)}@db.dhlwefrcowefvbxutsmc.supabase.co:5432/postgres`,
  });
  await client.connect();

  const phonePool = await client.query(`
    SELECT tenant_id, COUNT(*)::int AS cnt
    FROM phone_pool
    GROUP BY tenant_id
    ORDER BY cnt DESC
  `);
  console.log('phone_pool counts by tenant:');
  console.log(phonePool.rows);

  const tenants = await client.query(`
    SELECT id, tenant_code, tenant_name
    FROM tenants
    ORDER BY created_at DESC
    LIMIT 20
  `);
  console.log('tenants:');
  console.log(tenants.rows);

  const employees = await client.query(`
    SELECT id, username, real_name, tenant_id, status
    FROM employees
    ORDER BY created_at DESC
    LIMIT 30
  `);
  console.log('employees:');
  console.log(employees.rows);

  const knowledgeByTenant = await client.query(`
    SELECT tenant_id, COUNT(*)::int AS cnt
    FROM knowledge_articles
    GROUP BY tenant_id
    ORDER BY cnt DESC
  `);
  console.log('knowledge_articles by tenant:');
  console.log(knowledgeByTenant.rows);

  const knowledgeVisibility = await client.query(`
    SELECT visibility, COUNT(*)::int AS cnt
    FROM knowledge_articles
    GROUP BY visibility
    ORDER BY visibility
  `);
  console.log('knowledge_articles visibility:');
  console.log(knowledgeVisibility.rows);

  const categoryVisibility = await client.query(`
    SELECT visibility, is_active, COUNT(*)::int AS cnt
    FROM knowledge_categories
    GROUP BY visibility, is_active
    ORDER BY visibility, is_active
  `);
  console.log('knowledge_categories visibility/is_active:');
  console.log(categoryVisibility.rows);

  await client.end();
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
