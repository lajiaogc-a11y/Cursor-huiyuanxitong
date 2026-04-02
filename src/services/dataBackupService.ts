// Data Backup Service — 列表/删除走表代理；执行备份、读快照、删备份走 Node /api/admin/backup/*
import { apiGet, apiDelete, apiPost } from '@/api/client';

export interface BackupRecord {
  id: string;
  backup_name: string;
  trigger_type: 'auto' | 'manual';
  status: 'in_progress' | 'success' | 'failed';
  tables_backed_up: string[];
  record_counts: Record<string, number>;
  total_size_bytes: number;
  storage_path: string | null;
  error_message: string | null;
  created_by: string | null;
  created_by_name: string;
  created_at: string;
  completed_at: string | null;
}

/** 与 server DESIRED_BACKUP_TABLES 保持一致 */
const BACKUP_TABLES = [
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

// Get backup history from data_backups table
export async function getBackupHistory(): Promise<BackupRecord[]> {
  const data = await apiGet<BackupRecord[]>(
    '/api/data/table/data_backups?select=*&order=created_at.desc&limit=30'
  );
  return Array.isArray(data) ? data : [];
}

type RunBackupResponse = {
  success: true;
  backup_id: string;
  backup_name: string;
  record_counts: Record<string, number>;
  total_size_bytes: number;
};

// Execute manual backup（Node 本地 JSON，需管理员 JWT）
export async function executeBackup(
  trigger: 'manual',
  employeeId?: string,
  employeeName?: string
): Promise<BackupRecord> {
  if (trigger !== 'manual') {
    throw new Error('Only manual trigger supported from client');
  }

  const data = await apiPost<RunBackupResponse>('/api/admin/backup/run', {
    trigger_type: 'manual',
    created_by_name: employeeName || '管理员',
  });

  if (!data?.backup_id) {
    throw new Error('Backup failed');
  }

  const run = data;
  const record = await apiGet<BackupRecord | null>(
    `/api/data/table/data_backups?select=*&id=eq.${encodeURIComponent(run.backup_id)}&single=true`
  );

  return (record as unknown as BackupRecord) || {
    id: run.backup_id,
    backup_name: run.backup_name,
    trigger_type: 'manual',
    status: 'success',
    tables_backed_up: BACKUP_TABLES,
    record_counts: run.record_counts,
    total_size_bytes: run.total_size_bytes,
    storage_path: run.backup_id,
    error_message: null,
    created_by: employeeId || null,
    created_by_name: employeeName || '管理员',
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  };
}

// Delete backup：磁盘目录 + DB 记录（管理员接口）
export async function deleteBackup(backupId: string): Promise<void> {
  await apiDelete(`/api/admin/backup/${encodeURIComponent(backupId)}`);
}

// Get backup snapshot for a specific table
export async function getBackupSnapshot(backupId: string, table: string): Promise<any[]> {
  const rows = await apiGet<unknown[]>(
    `/api/admin/backup/${encodeURIComponent(backupId)}/table/${encodeURIComponent(table)}`
  );
  return Array.isArray(rows) ? rows : [];
}

// Restore backup - download from storage and upsert into tables
export async function restoreBackup(backupId: string): Promise<{
  success: boolean;
  restored: Record<string, number>;
  errors: string[];
}> {
  const restored: Record<string, number> = {};
  const errors: string[] = [];

  for (const table of BACKUP_TABLES) {
    try {
      const rows = await getBackupSnapshot(backupId, table);
      if (!rows || rows.length === 0) {
        restored[table] = 0;
        continue;
      }

      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        try {
          await apiPost(`/api/data/table/${encodeURIComponent(table)}`, {
            data: batch,
            upsert: true,
            onConflict: 'id',
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${table} batch ${Math.floor(i / 200) + 1}: ${msg}`);
        }
      }
      restored[table] = rows.length;
    } catch (err: unknown) {
      errors.push(`${table}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { success: errors.length === 0, restored, errors };
}

/** 仅恢复员工相关表（employees + employee_permissions），用于员工数据误删后的恢复 */
export async function restoreEmployeesOnly(backupId: string): Promise<{
  success: boolean;
  restored: Record<string, number>;
  errors: string[];
}> {
  const restored: Record<string, number> = {};
  const errors: string[] = [];
  const tables = ['employees', 'employee_permissions'];

  for (const table of tables) {
    try {
      const rows = await getBackupSnapshot(backupId, table);
      if (!rows || rows.length === 0) {
        restored[table] = 0;
        continue;
      }

      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        try {
          await apiPost(`/api/data/table/${encodeURIComponent(table)}`, {
            data: batch,
            upsert: true,
            onConflict: 'id',
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`${table} batch ${Math.floor(i / 200) + 1}: ${msg}`);
        }
      }
      restored[table] = rows.length;
    } catch (err: unknown) {
      errors.push(`${table}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { success: errors.length === 0, restored, errors };
}

// Export backup as JSON for download
export async function exportBackupAsJson(backupId: string): Promise<{
  data: Record<string, any[]>;
  counts: Record<string, number>;
}> {
  const data: Record<string, any[]> = {};
  const counts: Record<string, number> = {};

  for (const table of BACKUP_TABLES) {
    try {
      const rows = await getBackupSnapshot(backupId, table);
      data[table] = rows;
      counts[table] = rows.length;
    } catch {
      data[table] = [];
      counts[table] = 0;
    }
  }

  return { data, counts };
}

// 清理 webhook_event_queue：已处理超过 30 天、终态失败超过 90 天（可调，需管理员）
export async function cleanupWebhookEventQueue(options?: {
  processedRetentionDays?: number;
  failedRetentionDays?: number;
}): Promise<number> {
  const res = await apiPost<{ deleted?: number }>('/api/admin/webhooks/cleanup-event-queue', {
    processed_retention_days: options?.processedRetentionDays,
    failed_retention_days: options?.failedRetentionDays,
  });
  return typeof res?.deleted === 'number' ? res.deleted : 0;
}

// Format bytes to human readable
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
