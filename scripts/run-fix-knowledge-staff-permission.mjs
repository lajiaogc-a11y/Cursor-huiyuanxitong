#!/usr/bin/env node
/**
 * 修复公司文档员工权限：确保 staff/manager 能查看公司文档
 * 用法: node scripts/run-fix-knowledge-staff-permission.mjs
 * 需要: server/.env 中配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY
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
  console.error('请在 server/.env 中配置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  console.log('正在修复公司文档、汇率计算等员工权限...');
  const permItems = [
    ['navigation', 'knowledge_base'],
    ['knowledge_base', 'view_articles'],
    ['navigation', 'exchange_rate'],   // 汇率计算
    ['navigation', 'operation_logs'],  // 操作日志
    ['navigation', 'login_logs'],      // 登录日志
    ['navigation', 'dashboard'],
    ['navigation', 'orders'],
    ['navigation', 'members'],
  ];
  for (const role of ['staff', 'manager']) {
    for (const [module_name, field_name] of permItems) {
      const { data: existing } = await supabase
        .from('role_permissions')
        .select('id')
        .eq('role', role)
        .eq('module_name', module_name)
        .eq('field_name', field_name)
        .maybeSingle();
      if (existing) {
        await supabase
          .from('role_permissions')
          .update({ can_view: true, can_edit: module_name === 'navigation', can_delete: module_name === 'navigation', updated_at: new Date().toISOString() })
          .eq('role', role)
          .eq('module_name', module_name)
          .eq('field_name', field_name);
        console.log(`  更新: ${role} / ${module_name}.${field_name}`);
      } else {
        await supabase.from('role_permissions').insert({
          role,
          module_name,
          field_name,
          can_view: true,
          can_edit: module_name === 'navigation',
          can_delete: module_name === 'navigation',
        });
        console.log(`  新增: ${role} / ${module_name}.${field_name}`);
      }
    }
  }
  console.log('✓ 公司文档员工权限已修复');
}

main().catch((e) => {
  console.error('错误:', e.message);
  process.exit(1);
});
