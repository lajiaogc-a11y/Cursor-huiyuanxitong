/**
 * 为 member_portal_settings 添加 announcements 列（幂等）
 * 用法：在 server 目录执行 node scripts/add-member-portal-announcements-column.mjs
 */
import 'dotenv/config';
import mysql from 'mysql2/promise';

const host = process.env.MYSQL_HOST ?? 'localhost';
const port = parseInt(process.env.MYSQL_PORT ?? '3306', 10);
const user = process.env.MYSQL_USER ?? 'root';
const password = process.env.MYSQL_PASSWORD ?? '';
const database = process.env.MYSQL_DATABASE ?? 'gc_member_system';

const conn = await mysql.createConnection({ host, port, user, password, database });
try {
  await conn.execute(
    `ALTER TABLE member_portal_settings ADD COLUMN announcements JSON NULL COMMENT '会员端公告列表(JSON数组)' AFTER announcement`,
  );
  console.log('[OK] member_portal_settings.announcements 已添加');
} catch (e) {
  const code = e?.code;
  const msg = String(e?.message ?? e);
  if (code === 'ER_DUP_FIELDNAME' || msg.includes('Duplicate column')) {
    console.log('[SKIP] 列 announcements 已存在，无需添加');
  } else {
    console.error('[FAIL]', msg);
    process.exitCode = 1;
  }
} finally {
  await conn.end();
}
