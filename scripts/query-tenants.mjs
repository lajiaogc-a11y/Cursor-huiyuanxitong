#!/usr/bin/env node
/**
 * Query tenants via Supabase client - SELECT id, tenant_code FROM tenants LIMIT 5
 * Usage: node scripts/query-tenants.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const p = join(__dirname, '..', 'server', '.env');
  try {
    const content = readFileSync(p, 'utf-8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch (e) {
    console.error('Failed to load server/.env:', e.message);
    process.exit(1);
  }
}
loadEnv();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in server/.env');
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, tenant_code')
    .limit(5);

  if (error) {
    console.error('Query error:', error.message);
    process.exit(1);
  }
  console.log('Result:');
  console.log(JSON.stringify(data, null, 2));
}

main();
