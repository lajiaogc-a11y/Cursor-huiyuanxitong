#!/usr/bin/env node
/**
 * 调用 restore-from-backup Edge Function 执行恢复
 * 需要先部署: supabase functions deploy restore-from-backup
 *
 * 使用: node scripts/invoke-restore.mjs [备份ID]
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  try {
    const envPath = join(__dirname, '..', '.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch (_) {}
}
loadEnv();

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('❌ 缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_PUBLISHABLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);
const backupId = process.argv[2] || '99b21bbe-37bf-451b-a2ed-904ae1f9a182';

async function main() {
  console.log('调用 restore-from-backup，备份ID:', backupId);
  const { data, error } = await supabase.functions.invoke('restore-from-backup', {
    body: { backup_id: backupId },
  });

  if (error) {
    console.error('❌ 调用失败:', error.message);
    process.exit(1);
  }

  if (data?.success) {
    console.log('✓ 恢复成功！共', data.total, '条');
    console.log('  订单:', data.restored?.orders || 0);
    console.log('  会员:', data.restored?.members || 0);
    console.log('  员工:', data.restored?.employees || 0);
  } else {
    console.error('❌ 恢复失败:', data?.error || data?.errors?.join('; '));
    if (data?.restored) console.log('已恢复:', data.restored);
    process.exit(1);
  }
}

main();
