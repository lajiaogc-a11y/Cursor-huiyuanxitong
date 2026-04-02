/**
 * orders 表补齐迁移 — 与前端 mapOrderToDb / USDT 订单插入字段一致
 * 启动时自动执行，避免生产库缺列导致 Unknown column
 */
import { execute, query } from '../../database/index.js';
import { backfillReadableOrderNumbers } from './orderNumber.js';

async function orderColumnExists(columnName: string): Promise<boolean> {
  const rows = await query<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = ?
     LIMIT 1`,
    [columnName]
  );
  return rows.length > 0;
}

/** 若 orders 表存在且缺列则 ADD COLUMN（幂等） */
export async function migrateOrdersTable(): Promise<void> {
  const tableCheck = await query<{ cnt: number }>(
    `SELECT 1 AS cnt FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' LIMIT 1`
  );
  if (tableCheck.length === 0) {
    console.warn('[orders] migrate: orders table missing, skip');
    return;
  }

  const additions: Array<[string, string]> = [
    // 创建订单时前端写入（与 creator_id 同义，兼容旧 Supabase 字段名）
    ['account_id', 'CHAR(36) NULL'],
    // 表代理租户隔离、列表筛选依赖（与 fix_columns / 业务一致）
    ['tenant_id', 'CHAR(36) NULL'],
  ];

  for (const [col, ddl] of additions) {
    if (!(await orderColumnExists(col))) {
      await execute(`ALTER TABLE orders ADD COLUMN \`${col}\` ${ddl}`);
      console.log(`[orders] migration: added column ${col}`);
    }
  }

  await backfillReadableOrderNumbers();
}
