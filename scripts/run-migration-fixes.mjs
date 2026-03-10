#!/usr/bin/env node
/**
 * 执行迁移修复脚本：订单统计 + 仪表盘交易用户
 *
 * 方式一：.env 中配置 DATABASE_URL 或 DATABASE_PASSWORD
 * 方式二：命令行传入 DATABASE_PASSWORD（PowerShell: $env:DATABASE_PASSWORD="密码"; npm run db:migrate-fixes）
 * 方式三：直接运行，按提示输入密码
 */
import pg from 'pg';
import { createInterface } from 'readline';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'dhlwefrcowefvbxutsmc';

// 简单加载 .env
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
    rl.question('请输入 Supabase 数据库密码（在 Project Settings → Database 可查看/重置）: ', (pwd) => {
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
      console.log(`
未找到 DATABASE_URL 或 DATABASE_PASSWORD，将使用交互式输入。
数据库：postgres@db.${PROJECT_REF}.supabase.co:5432/postgres
`);
      password = await askPassword();
    }
    if (!password) {
      console.error('❌ 未输入密码，已退出。');
      process.exit(1);
    }
    const encoded = encodeURIComponent(password);
    DATABASE_URL = `postgresql://postgres:${encoded}@db.${PROJECT_REF}.supabase.co:5432/postgres`;
  }

  const sqlPath = join(__dirname, '..', 'supabase', 'migrations', 'run-fixes.sql');
  const sql = readFileSync(sqlPath, 'utf-8');

  const client = new pg.Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();
    console.log('✓ 已连接数据库');
    await client.query(sql);
    console.log('✓ 迁移执行成功！订单统计与仪表盘交易用户已修复。');
  } catch (err) {
    console.error('✗ 执行失败:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
