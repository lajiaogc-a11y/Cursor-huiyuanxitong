/**
 * 本地磁盘数据备份（定时 JSON 快照）
 */
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { isTableProxyAllowed } from '../data/tableProxy.js';
import {
  queryExistingTableNames,
  deleteBackupRecordById,
  listBackupsOrderedDesc,
  listBackupsOlderThan,
  insertBackupRecord,
  updateBackupRecordSuccess,
  updateBackupRecordFailed,
  selectTableRowsBatch,
} from './repository.js';

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

async function resolveTablesToBackup(): Promise<string[]> {
  const desired = desiredBackupTables();
  if (desired.length === 0) return [];
  const existing = new Set(await queryExistingTableNames(desired));
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
  await deleteBackupRecordById(tid);
}

async function cleanupOldBackups(): Promise<void> {
  const root = backupRootDir();
  try {
    const rows = await listBackupsOrderedDesc();
    if (rows.length > MAX_BACKUPS) {
      const toDrop = rows.slice(MAX_BACKUPS);
      for (const old of toDrop) {
        const sp = old.storage_path || old.id;
        try {
          await fs.rm(path.join(root, sp), { recursive: true, force: true });
        } catch {
          /* ignore */
        }
        await deleteBackupRecordById(old.id);
      }
    }
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);
    const oldByAge = await listBackupsOlderThan(cutoff);
    for (const old of oldByAge) {
      const sp = old.storage_path || old.id;
      try {
        await fs.rm(path.join(root, sp), { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      await deleteBackupRecordById(old.id);
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

  await insertBackupRecord({
    id: backupId,
    backupName,
    triggerType,
    tables,
    createdByName: input.createdByName,
  });

  try {
    for (const table of tables) {
      const allRows: unknown[] = [];
      let offset = 0;
      for (;;) {
        const chunk = await selectTableRowsBatch(table, BATCH_SIZE, offset);
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

    await updateBackupRecordSuccess({
      id: backupId,
      recordCounts,
      totalSizeBytes,
    });

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
    await updateBackupRecordFailed({
      id: backupId,
      errorMessage: msg,
      recordCounts,
    });
    throw err;
  }
}
