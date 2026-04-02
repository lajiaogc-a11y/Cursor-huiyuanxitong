/**
 * 知识库表 tenant_id（与 fix_columns / 租户迁移一致，幂等）
 */
import { execute, queryOne } from '../../database/index.js';

async function ensureColumn(table: string, afterCol: string): Promise<void> {
  const t = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  if (!Number(t?.c)) return;

  const has = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'tenant_id'`,
    [table],
  );
  if (Number(has?.c)) return;

  await execute(`ALTER TABLE \`${table}\` ADD COLUMN tenant_id CHAR(36) NULL AFTER \`${afterCol}\``);
}

export async function migrateKnowledgeTenantColumns(): Promise<void> {
  await ensureColumn('knowledge_categories', 'id');
  await ensureColumn('knowledge_articles', 'id');
}
