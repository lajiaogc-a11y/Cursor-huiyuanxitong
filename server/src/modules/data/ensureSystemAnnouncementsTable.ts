/**
 * 平台公告 system_announcements + 站内信 notifications（未跑 fix_schema 的库会缺表）
 */
import { execute, queryOne } from '../../database/index.js';

async function tableExists(tableName: string): Promise<boolean> {
  const r = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName],
  );
  return Number(r?.c) > 0;
}

async function columnExists(tableName: string, colName: string): Promise<boolean> {
  const r = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, colName],
  );
  return Number(r?.c) > 0;
}

async function addColumnIfMissing(tableName: string, colName: string, colDef: string): Promise<void> {
  if (await columnExists(tableName, colName)) return;
  await execute(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${colName}\` ${colDef}`);
}

/** 与 migrateSchemaPatches.ts 一致 */
export async function ensureSystemAnnouncementsAndNotifications(): Promise<void> {
  if (!(await tableExists('notifications'))) {
    await execute(`
      CREATE TABLE notifications (
        id CHAR(36) NOT NULL PRIMARY KEY,
        tenant_id CHAR(36) NULL,
        user_id CHAR(36) NULL,
        title VARCHAR(500) NULL,
        content TEXT NULL,
        type VARCHAR(50) NULL DEFAULT 'info',
        category VARCHAR(100) NULL DEFAULT 'system',
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        link VARCHAR(500) NULL,
        metadata JSON NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        KEY idx_notif_user (user_id),
        KEY idx_notif_created (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } else {
    await addColumnIfMissing('notifications', 'category', "VARCHAR(100) NULL DEFAULT 'system'");
    await addColumnIfMissing('notifications', 'metadata', 'JSON NULL');
  }

  if (!(await tableExists('system_announcements'))) {
    await execute(`
      CREATE TABLE system_announcements (
        id CHAR(36) NOT NULL PRIMARY KEY,
        scope VARCHAR(20) NOT NULL,
        tenant_id CHAR(36) NULL,
        title VARCHAR(500) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(20) NOT NULL DEFAULT 'info',
        link VARCHAR(500) NULL,
        created_by CHAR(36) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        KEY idx_system_announcements_created_at (created_at),
        KEY idx_system_announcements_scope_tenant (scope, tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }
}
