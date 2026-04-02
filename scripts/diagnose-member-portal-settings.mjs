#!/usr/bin/env node
/**
 * 诊断会员门户设置 - 验证会员 11111111 与 member_portal_settings
 * 用法: node scripts/diagnose-member-portal-settings.mjs [account]
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const account = process.argv[2] || '11111111';

function loadEnv() {
  for (const p of [join(__dirname, '..', 'server', '.env'), join(__dirname, '..', '.env')]) {
    try {
      const content = readFileSync(p, 'utf-8');
      for (const line of content.split('\n')) {
        const m = line.match(/^([^#=]+)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
      }
    } catch (_) {}
  }
}
loadEnv();

async function main() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const m = url?.match(/https:\/\/([^.]+)\.supabase\.co/);
  const projectRef = m ? m[1] : process.env.SUPABASE_PROJECT_REF || 'dhlwefrcowefvbxutsmc';
  const password = process.env.DATABASE_PASSWORD?.trim();
  const DATABASE_URL = process.env.DATABASE_URL ||
    (password ? `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres` : null);
  if (!DATABASE_URL) {
    console.error('需要 DATABASE_URL 或 DATABASE_PASSWORD');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();
    console.log(`\n=== 诊断会员门户设置 (account: ${account}) ===\n`);

    // 1. 查找会员
    const { rows: members } = await client.query(`
      SELECT id, phone_number, member_code, tenant_id, creator_id, recorder_id
      FROM members
      WHERE phone_number = $1 OR member_code = $1
    `, [account.trim()]);
    if (members.length === 0) {
      console.log('❌ 未找到该会员 (phone_number 或 member_code 匹配)');
      return;
    }
    const member = members[0];
    console.log('会员信息:', {
      id: member.id,
      phone_number: member.phone_number,
      member_code: member.member_code,
      tenant_id: member.tenant_id,
    });

    // 2. member_resolve_tenant_id 逻辑
    let resolvedTenantId = member.tenant_id;
    if (!resolvedTenantId && (member.creator_id || member.recorder_id)) {
      const { rows: emp } = await client.query(`
        SELECT COALESCE(ec.tenant_id, er.tenant_id) as tid
        FROM members m
        LEFT JOIN employees ec ON ec.id = m.creator_id
        LEFT JOIN employees er ON er.id = m.recorder_id
        WHERE m.id = $1
      `, [member.id]);
      resolvedTenantId = emp[0]?.tid;
    }
    if (!resolvedTenantId) {
      const { rows: ma } = await client.query(`
        SELECT tenant_id FROM member_activity WHERE member_id = $1 AND tenant_id IS NOT NULL LIMIT 1
      `, [member.id]);
      resolvedTenantId = ma[0]?.tenant_id;
    }
    console.log('解析到的 tenant_id:', resolvedTenantId || '(null - 将使用默认配置)');

    // 3. 调用 member_get_portal_settings 等效逻辑
    if (resolvedTenantId) {
      await client.query('SELECT apply_due_member_portal_versions_for_tenant($1)', [resolvedTenantId]);
      const { rows: settings } = await client.query(`
        SELECT company_name, theme_primary_color, welcome_title, welcome_subtitle, updated_at
        FROM member_portal_settings WHERE tenant_id = $1
      `, [resolvedTenantId]);
      console.log('\nmember_portal_settings 当前配置:', settings[0] || '(无)');

      const { rows: versions } = await client.query(`
        SELECT id, version_no, is_applied, effective_at, created_at
        FROM member_portal_settings_versions
        WHERE tenant_id = $1 ORDER BY version_no DESC LIMIT 5
      `, [resolvedTenantId]);
      console.log('\n最近版本:', versions);
    }

    // 4. 模拟 member_get_portal_settings_by_account 返回
    const { rows: rpcResult } = await client.query(
      'SELECT member_get_portal_settings_by_account($1) as result',
      [account.trim()]
    );
    const result = rpcResult[0]?.result;
    if (result?.success) {
      console.log('\nmember_get_portal_settings_by_account 返回:', JSON.stringify({
        success: result.success,
        tenant_id: result.tenant_id,
        tenant_name: result.tenant_name,
        settings_keys: result.settings ? Object.keys(result.settings) : [],
        company_name: result.settings?.company_name,
      }, null, 2));
    } else {
      console.log('\nmember_get_portal_settings_by_account 返回:', result);
    }
  } catch (err) {
    console.error('错误:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
