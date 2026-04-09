/**
 * Backup Repository — data_backups 表 + 备份数据读取的唯一 DB 层
 */
import { query, execute } from '../../database/index.js';

export interface BackupRecord {
  id: string;
  created_at: Date | string;
  storage_path: string | null;
}

export async function queryExistingTableNames(desired: string[]): Promise<string[]> {
  if (desired.length === 0) return [];
  const ph = desired.map(() => '?').join(', ');
  const rows = await query<{ TABLE_NAME: string }>(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${ph})`,
    desired,
  );
  return rows.map((r) => String(r.TABLE_NAME).toLowerCase());
}

export async function deleteBackupRecordById(id: string): Promise<void> {
  await execute('DELETE FROM `data_backups` WHERE `id` = ?', [id]);
}

export async function listBackupsOrderedDesc(): Promise<BackupRecord[]> {
  return query<BackupRecord>(
    'SELECT id, created_at, storage_path FROM `data_backups` ORDER BY created_at DESC',
  );
}

export async function listBackupsOlderThan(cutoff: Date): Promise<Pick<BackupRecord, 'id' | 'storage_path'>[]> {
  return query<Pick<BackupRecord, 'id' | 'storage_path'>>(
    'SELECT id, storage_path FROM `data_backups` WHERE created_at < ?',
    [cutoff],
  );
}

export async function insertBackupRecord(params: {
  id: string;
  backupName: string;
  triggerType: string;
  tables: string[];
  createdByName: string;
}): Promise<void> {
  await execute(
    `INSERT INTO \`data_backups\` (\`id\`, \`backup_name\`, \`trigger_type\`, \`status\`, \`tables_backed_up\`, \`record_counts\`, \`total_size_bytes\`, \`created_by\`, \`created_by_name\`)
     VALUES (?, ?, ?, 'in_progress', CAST(? AS JSON), CAST(? AS JSON), 0, NULL, ?)`,
    [params.id, params.backupName, params.triggerType, JSON.stringify(params.tables), JSON.stringify({}), params.createdByName],
  );
}

export async function updateBackupRecordSuccess(params: {
  id: string;
  recordCounts: Record<string, number>;
  totalSizeBytes: number;
}): Promise<void> {
  await execute(
    `UPDATE \`data_backups\` SET \`status\` = 'success', \`record_counts\` = CAST(? AS JSON), \`total_size_bytes\` = ?, \`storage_path\` = ?, \`completed_at\` = NOW(3) WHERE \`id\` = ?`,
    [JSON.stringify(params.recordCounts), params.totalSizeBytes, params.id, params.id],
  );
}

export async function updateBackupRecordFailed(params: {
  id: string;
  errorMessage: string;
  recordCounts: Record<string, number>;
}): Promise<void> {
  await execute(
    `UPDATE \`data_backups\` SET \`status\` = 'failed', \`error_message\` = ?, \`record_counts\` = CAST(? AS JSON), \`completed_at\` = NOW(3) WHERE \`id\` = ?`,
    [params.errorMessage, JSON.stringify(params.recordCounts), params.id],
  );
}

export async function selectTableRowsBatch<T = Record<string, unknown>>(
  tableName: string,
  limit: number,
  offset: number,
): Promise<T[]> {
  const selectSql =
    tableName === 'uploaded_images'
      ? `SELECT id, tenant_id, content_type, file_name, size_bytes, created_by, created_at,
                NULL AS data_omitted FROM \`${tableName}\` LIMIT ? OFFSET ?`
      : `SELECT * FROM \`${tableName}\` LIMIT ? OFFSET ?`;
  return query<T>(selectSql, [limit, offset]);
}
