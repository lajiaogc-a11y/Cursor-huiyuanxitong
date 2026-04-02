/**
 * 一次性检查：cards 是表还是视图、结构、行数
 * 用法：在 server 目录执行 node scripts/inspect-cards-table.mjs（读取 .env）
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_HOST ?? 'localhost',
    port: parseInt(process.env.MYSQL_PORT ?? '3306', 10),
    user: process.env.MYSQL_USER ?? 'root',
    password: process.env.MYSQL_PASSWORD ?? '',
    database: process.env.MYSQL_DATABASE ?? 'gc_member_system',
  });

  const db = process.env.MYSQL_DATABASE ?? 'gc_member_system';
  console.log(`数据库: ${db}\n`);

  const [meta] = await conn.query(
    `SELECT TABLE_NAME, TABLE_TYPE, ENGINE, TABLE_ROWS, CREATE_TIME
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'cards'`,
    [db],
  );

  if (!meta.length) {
    console.log('未找到名为 `cards` 的表或视图（可能尚未创建或库名不对）。');
    await conn.end();
    return;
  }

  console.log('=== information_schema.TABLES（cards）===');
  console.log(JSON.stringify(meta, null, 2));
  console.log('');

  const [createRows] = await conn.query('SHOW CREATE TABLE `cards`');
  console.log('=== SHOW CREATE TABLE cards ===');
  const row = createRows[0];
  const key = Object.keys(row).find((k) => k.toLowerCase().includes('create'));
  console.log(row[key] || JSON.stringify(row, null, 2));
  console.log('');

  const [cnt] = await conn.query('SELECT COUNT(*) AS row_count FROM `cards`');
  console.log('=== SELECT COUNT(*) FROM cards ===');
  console.log(JSON.stringify(cnt, null, 2));

  await conn.end();
}

main().catch((e) => {
  console.error('执行失败:', e.message);
  process.exit(1);
});
