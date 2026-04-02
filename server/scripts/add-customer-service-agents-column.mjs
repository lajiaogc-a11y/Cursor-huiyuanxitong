/**
 * 为 member_portal_settings 添加 customer_service_agents 列（若不存在）
 * 用法：在 server 目录下执行 node scripts/add-customer-service-agents-column.mjs
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import mysql from 'mysql2/promise';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const database = process.env.MYSQL_DATABASE || 'gc_member_system';

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD ?? '',
  database,
  charset: 'utf8mb4',
});

async function main() {
  const [rows] = await pool.execute(
    `SELECT 1 AS ok FROM information_schema.columns
     WHERE table_schema = ? AND table_name = 'member_portal_settings' AND column_name = 'customer_service_agents' LIMIT 1`,
    [database]
  );
  if (rows.length > 0) {
    console.log('[OK] 列 customer_service_agents 已存在，无需修改。');
    await pool.end();
    return;
  }
  await pool.execute(
    'ALTER TABLE member_portal_settings ADD COLUMN customer_service_agents JSON NULL AFTER customer_service_link'
  );
  console.log('[OK] 已添加列 member_portal_settings.customer_service_agents');
  await pool.end();
}

main().catch((e) => {
  console.error('[失败]', e.message || e);
  process.exit(1);
});
