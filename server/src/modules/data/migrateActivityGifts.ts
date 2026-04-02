/**
 * activity_gifts 补齐 tenant_id / status（与 fix_schema、租户迁移、表代理隔离一致）
 */
import { execute, query } from '../../database/index.js';

async function columnExists(column: string): Promise<boolean> {
  const rows = await query<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activity_gifts' AND COLUMN_NAME = ?
     LIMIT 1`,
    [column],
  );
  return rows.length > 0;
}

export async function migrateActivityGiftsTable(): Promise<void> {
  const tableCheck = await query(
    `SELECT 1 AS cnt FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'activity_gifts' LIMIT 1`,
  );
  if (tableCheck.length === 0) return;

  if (!(await columnExists('tenant_id'))) {
    await execute(`ALTER TABLE activity_gifts ADD COLUMN tenant_id CHAR(36) NULL AFTER id`);
    await execute(`ALTER TABLE activity_gifts ADD KEY idx_activity_gifts_tenant (tenant_id)`);
  }
  if (!(await columnExists('status'))) {
    await execute(
      `ALTER TABLE activity_gifts ADD COLUMN status VARCHAR(50) NULL DEFAULT 'active' AFTER tenant_id`,
    );
  }
}
