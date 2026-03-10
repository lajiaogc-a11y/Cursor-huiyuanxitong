// Data Backup Service - uses data_backups table + storage bucket
import { supabase } from '@/integrations/supabase/client';

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

const BACKUP_TABLES = [
  // Tier 1 - Core Business Data
  'orders', 'members', 'ledger_transactions', 'member_activity',
  'points_ledger', 'points_accounts', 'activity_gifts',
  'shared_data_store', 'balance_change_logs',
  // Tier 2 - Audit & Operations
  'operation_logs', 'audit_records', 'employee_login_logs',
  'permission_change_logs', 'employee_name_history',
  // Tier 3 - Employee & Access Control
  'employees', 'employee_permissions', 'role_permissions',
  'permission_versions', 'profiles', 'invitation_codes',
  // Tier 4 - Business Configuration
  'vendors', 'cards', 'card_types', 'payment_providers',
  'currencies', 'customer_sources', 'activity_types',
  'activity_reward_tiers', 'referral_relations',
  // Tier 5 - Operations & Knowledge
  'shift_handovers', 'shift_receivers',
  'knowledge_articles', 'knowledge_categories', 'knowledge_read_status',
  // Tier 6 - System Config
  'data_settings', 'navigation_config', 'report_titles',
  'exchange_rate_state', 'user_data_store',
  // Tier 7 - API & Webhooks
  'api_keys', 'webhooks', 'webhook_delivery_logs',
];

// Get backup history from data_backups table
export async function getBackupHistory(): Promise<BackupRecord[]> {
  const { data, error } = await supabase
    .from('data_backups' as any)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) throw new Error(error.message);
  return (data || []) as unknown as BackupRecord[];
}

// Execute manual backup via edge function
export async function executeBackup(
  trigger: 'manual',
  employeeId?: string,
  employeeName?: string
): Promise<BackupRecord> {
  // Use supabase.functions.invoke so the SDK auto-refreshes expired JWT tokens
  const { data, error } = await supabase.functions.invoke('scheduled-backup', {
    body: {
      trigger_type: 'manual',
      created_by: null, // avoid FK constraint issues; name is sufficient for audit
      created_by_name: employeeName || '管理员',
    },
  });

  if (error) {
    // Extract actual error body from FunctionsHttpError.context (Response object)
    let message = error.message;
    try {
      if (error.context && typeof error.context.json === 'function') {
        const body = await error.context.json();
        message = body?.error || body?.message || message;
      }
    } catch { /* ignore parse error */ }
    throw new Error(message);
  }
  if (!data?.success) throw new Error(data?.error || 'Backup failed');

  // Fetch the newly created record
  const { data: record } = await supabase
    .from('data_backups' as any)
    .select('*')
    .eq('id', data.backup_id)
    .single();

  return (record as unknown as BackupRecord) || {
    id: data.backup_id,
    backup_name: data.backup_name,
    trigger_type: 'manual',
    status: 'success',
    tables_backed_up: BACKUP_TABLES,
    record_counts: data.record_counts,
    total_size_bytes: data.total_size_bytes,
    storage_path: data.backup_id,
    error_message: null,
    created_by: employeeId || null,
    created_by_name: employeeName || '管理员',
    created_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
  };
}

// Delete a backup (storage files + db record)
export async function deleteBackup(backupId: string): Promise<void> {
  // Get backup record to find storage path
  const { data: record } = await supabase
    .from('data_backups' as any)
    .select('storage_path')
    .eq('id', backupId)
    .single();

  const storagePath = (record as any)?.storage_path;
  if (storagePath) {
    const { data: files } = await supabase.storage
      .from('data-backups')
      .list(storagePath);

    if (files && files.length > 0) {
      await supabase.storage
        .from('data-backups')
        .remove(files.map(f => `${storagePath}/${f.name}`));
    }
  }

  const { error } = await supabase
    .from('data_backups' as any)
    .delete()
    .eq('id', backupId);

  if (error) throw new Error(error.message);
}

// Get backup snapshot for a specific table
export async function getBackupSnapshot(backupId: string, table: string): Promise<any[]> {
  // Get storage path
  const { data: record } = await supabase
    .from('data_backups' as any)
    .select('storage_path')
    .eq('id', backupId)
    .single();

  const storagePath = (record as any)?.storage_path;
  if (!storagePath) return [];

  const { data, error } = await supabase.storage
    .from('data-backups')
    .download(`${storagePath}/${table}.json`);

  if (error) throw new Error(error.message);

  const text = await data.text();
  return JSON.parse(text);
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

      // Upsert in batches of 200
      for (let i = 0; i < rows.length; i += 200) {
        const batch = rows.slice(i, i + 200);
        const { error } = await supabase
          .from(table as any)
          .upsert(batch as any, { onConflict: 'id' });

        if (error) {
          errors.push(`${table} batch ${Math.floor(i / 200) + 1}: ${error.message}`);
        }
      }
      restored[table] = rows.length;
    } catch (err: any) {
      errors.push(`${table}: ${err.message}`);
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
        const { error } = await supabase
          .from(table as any)
          .upsert(batch as any, { onConflict: 'id' });

        if (error) {
          errors.push(`${table} batch ${Math.floor(i / 200) + 1}: ${error.message}`);
        }
      }
      restored[table] = rows.length;
    } catch (err: any) {
      errors.push(`${table}: ${err.message}`);
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

// Cleanup webhook_event_queue expired records
export async function cleanupWebhookEventQueue(): Promise<number> {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);

    const { data, error } = await supabase
      .from('webhook_event_queue' as any)
      .delete()
      .lt('created_at', cutoff.toISOString())
      .select('id');

    if (error) {
      console.warn('Webhook queue cleanup:', error.message);
      return 0;
    }

    return data?.length || 0;
  } catch {
    return 0;
  }
}

// Format bytes to human readable
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
