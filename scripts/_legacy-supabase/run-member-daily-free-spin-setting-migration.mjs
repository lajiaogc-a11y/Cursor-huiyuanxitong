#!/usr/bin/env node
/**
 * 执行迁移：会员门户每日免费抽奖次数配置
 * 文件：20260406000000_member_daily_free_spin_setting.sql
 *
 * 用法：
 * 1) 设置 DATABASE_URL，或
 * 2) 设置 DATABASE_PASSWORD（可选 SUPABASE_PROJECT_REF），再执行本脚本
 */
import pg from 'pg';
import { createInterface } from 'readline';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'dhlwefrcowefvbxutsmc';

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

function askPassword() {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('请输入 Supabase 数据库密码（Project Settings → Database）: ', (pwd) => {
      rl.close();
      resolve((pwd || '').trim());
    });
  });
}

async function main() {
  let DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    let password = process.env.DATABASE_PASSWORD?.trim();
    if (!password) {
      console.log(`\n未找到 DATABASE_URL 或 DATABASE_PASSWORD，将使用交互式输入。\n数据库：postgres@db.${PROJECT_REF}.supabase.co:5432/postgres\n`);
      password = await askPassword();
    }
    if (!password) {
      console.error('❌ 未输入密码，已退出。');
      process.exit(1);
    }
    const encoded = encodeURIComponent(password);
    DATABASE_URL = `postgresql://postgres:${encoded}@db.${PROJECT_REF}.supabase.co:5432/postgres`;
  }

  const client = new pg.Client({ connectionString: DATABASE_URL });
  const migrationFile = '20260406000000_member_daily_free_spin_setting.sql';
  const sqlPath = join(__dirname, '..', 'supabase', 'migrations', migrationFile);

  try {
    await client.connect();
    console.log('✓ 已连接数据库');
    const sql = readFileSync(sqlPath, 'utf-8');
    await client.query(sql);
    console.log(`✓ ${migrationFile} 执行成功`);
    console.log('\n✓ 迁移完成：');
    console.log('  - 已新增 daily_free_spins_per_day 字段');
    console.log('  - 抽奖记录“每日免费次数”会按天自动刷新');
    console.log('  - 会员门户设置读取/发布已包含该字段');
  } catch (err) {
    console.error('✗ 执行失败:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
