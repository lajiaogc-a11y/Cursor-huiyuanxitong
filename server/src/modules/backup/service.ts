/**
 * 本地磁盘数据备份（定时 JSON 快照）
 */
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { query, execute } from '../../database/index.js';
import { isTableProxyAllowed } from '../data/tableProxy.js';

const MAX_BACKUPS = 7;
const MAX_AGE_DAYS = 3;
const BATCH_SIZE = 1000;

/** 与前端 dataBackupService BACKUP_TABLES 对齐，仅备份表代理白名单内且库中存在的表 */
export const DESIRED_BACKUP_TABLES: string[] = [
  'orders', 'members', 'ledger_transactions', 'member_activity',
  'points_ledger', 'points_accounts', 'activity_gifts',
  'shared_data_store', 'balance_change_logs',
  'operation_logs', 'audit_records', 'employee_login_logs',
  'permission_change_logs', 'employee_name_history',
  'employees', 'employee_permissions', 'role_permissions',
  'permission_versions', 'profiles', 'invitation_codes',
  'vendors', 'cards', 'card_types', 'payment_providers',
  'currencies', 'customer_sources', 'activity_types',
  'activity_reward_tiers', 'referral_relations',
  'shift_handovers', 'shift_receivers',
  'knowledge_articles', 'knowledge_categories', 'knowledge_read_status',
  'data_settings', 'report_titles', 'exchange_rate_state',
  'user_data_store',
  'api_keys', 'webhooks', 'webhook_delivery_logs', 'webhook_event_queue',
  'gift_cards', 'announcements', 'site_messages',
  'tasks', 'task_templates', 'task_comments',
  'lottery_prizes', 'lottery_logs', 'points_log', 'lottery_settings', 'uploaded_images',
  'member_operation_logs',
  'archived_orders', 'archived_operation_logs', 'archived_points_ledger', 'archive_runs',
];

function backupRootDir(): string {
  const fromEnv = process.env.DATA_BACKUP_DIR?.trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(process.cwd(), 'data-backups');
}

function sanitizeTableName(name: string): string | null {
  if (!/^[a-z0-9_]{1,64}$/i.test(name)) return null;
  const lower = name.toLowerCase();
  return isTableProxyAllowed(lower) ? lower : null;
}

function desiredBackupTables(): string[] {
  return DESIRED_BACKUP_TABLES.filter((t) => isTableProxyAllowed(t));
}

/** 仅备份当前库中已存在的表，避免缺归档表等导致整次备份失败 */
async function resolveTablesToBackup(): Promise<string[]> {
  const desired = desiredBackupTables();
  if (desired.length === 0) return [];
  const ph = desired.map(() => '?').join(', ');
  const rows = await query<{ TABLE_NAME: string }>(
    `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${ph})`,
    desired,
  );
  const existing = new Set(rows.map((r) => String(r.TABLE_NAME).toLowerCase()));
  return desired.filter((t) => existing.has(t.toLowerCase()));
}

export async function readBackupTableJson(backupId: string, table: string): Promise<unknown[]> {
  const tid = /^[0-9a-f-]{36}$/i.test(backupId) ? backupId : null;
  const tbl = sanitizeTableName(table);
  if (!tid || !tbl) throw new Error('INVALID_PARAMS');
  const filePath = path.join(backupRootDir(), tid, `${tbl}.json`);
  const raw = await fs.readFile(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('INVALID_BACKUP_FILE');
  return parsed;
}

export async function deleteBackupFilesAndRecord(backupId: string): Promise<void> {
  const tid = /^[0-9a-f-]{36}$/i.test(backupId) ? backupId : null;
  if (!tid) throw new Error('INVALID_BACKUP_ID');
  const dir = path.join(backupRootDir(), tid);
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    /* 目录不存在时忽略 */
  }
  await execute('DELETE FROM `data_backups` WHERE `id` = ?', [tid]);
}

async function cleanupOldBackups(): Promise<void> {
  const root = backupRootDir();
  try {
    const rows = await query<{ id: string; created_at: Date | string; storage_path: string | null }>(
      'SELECT id, created_at, storage_path FROM `data_backups` ORDER BY created_at DESC'
    );
    if (rows.length > MAX_BACKUPS) {
      const toDrop = rows.slice(MAX_BACKUPS);
      for (const old of toDrop) {
        const sp = old.storage_path || old.id;
        try {
          await fs.rm(path.join(root, sp), { recursive: true, force: true });
        } catch {
          /* ignore */
        }
        await execute('DELETE FROM `data_backups` WHERE `id` = ?', [old.id]);
      }
    }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);
    const oldByAge = await query<{ id: string; storage_path: string | null }>(
      'SELECT id, storage_path FROM `data_backups` WHERE created_at < ?',
      [cutoff]
    );
    for (const old of oldByAge) {
      const sp = old.storage_path || old.id;
      try {
        await fs.rm(path.join(root, sp), { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      await execute('DELETE FROM `data_backups` WHERE `id` = ?', [old.id]);
    }
  } catch (e) {
    console.warn('[Backup] cleanup non-fatal:', (e as Error).message);
  }
}

export async function runDataBackup(input: {
  triggerType: 'manual' | 'auto';
  createdByName: string;
}): Promise<{
  success: true;
  backup_id: string;
  backup_name: string;
  record_counts: Record<string, number>;
  total_size_bytes: number;
}> {
  const tables = await resolveTablesToBackup();
  const now = new Date();
  const triggerType = input.triggerType;
  const backupName = `${triggerType}_${now.toISOString().slice(0, 16).replace('T', '_').replace(':', '-')}`;
  const backupId = randomUUID();
  const root = backupRootDir();
  await fs.mkdir(path.join(root, backupId), { recursive: true });

  const recordCounts: Record<string, number> = {};
  let totalSizeBytes = 0;

  await execute(
    `INSERT INTO \`data_backups\` (\`id\`, \`backup_name\`, \`trigger_type\`, \`status\`, \`tables_backed_up\`, \`record_counts\`, \`total_size_bytes\`, \`created_by\`, \`created_by_name\`)
     VALUES (?, ?, ?, 'in_progress', CAST(? AS JSON), CAST(? AS JSON), 0, NULL, ?)`,
    [backupId, backupName, triggerType, JSON.stringify(tables), JSON.stringify({}), input.createdByName]
  );

  try {
    for (const table of tables) {
      const allRows: unknown[] = [];
      let offset = 0;
      for (;;) {
        /** uploaded_images.data 为 MEDIUMBLOB，全量进 JSON 会极大膨胀；备份仅保留元数据 */
        const selectSql =
          table === 'uploaded_images'
            ? `SELECT id, tenant_id, content_type, file_name, size_bytes, created_by, created_at,
                      NULL AS data_omitted FROM \`${table}\` LIMIT ? OFFSET ?`
            : `SELECT * FROM \`${table}\` LIMIT ? OFFSET ?`;
        const chunk = await query<Record<string, unknown>>(selectSql, [BATCH_SIZE, offset]);
        if (!chunk.length) break;
        allRows.push(...chunk);
        if (chunk.length < BATCH_SIZE) break;
        offset += BATCH_SIZE;
      }
      recordCounts[table] = allRows.length;
      const jsonContent = JSON.stringify(allRows);
      await fs.writeFile(path.join(root, backupId, `${table}.json`), jsonContent, 'utf8');
      totalSizeBytes += Buffer.byteLength(jsonContent, 'utf8');
    }

    await execute(
      `UPDATE \`data_backups\` SET \`status\` = 'success', \`record_counts\` = CAST(? AS JSON), \`total_size_bytes\` = ?, \`storage_path\` = ?, \`completed_at\` = NOW(3) WHERE \`id\` = ?`,
      [JSON.stringify(recordCounts), totalSizeBytes, backupId, backupId]
    );

    await cleanupOldBackups();

    return {
      success: true,
      backup_id: backupId,
      backup_name: backupName,
      record_counts: recordCounts,
      total_size_bytes: totalSizeBytes,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await execute(
      `UPDATE \`data_backups\` SET \`status\` = 'failed', \`error_message\` = ?, \`record_counts\` = CAST(? AS JSON), \`completed_at\` = NOW(3) WHERE \`id\` = ?`,
      [msg, JSON.stringify(recordCounts), backupId]
    );
    throw err;
  }
}
