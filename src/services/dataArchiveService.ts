// ============= 数据归档服务 =============
// 管理冷热数据分离 - 将历史数据归档到归档表

import { supabase } from '@/integrations/supabase/client';

export interface ArchiveRun {
  id: string;
  run_at: string;
  tables_processed: string[];
  records_archived: Record<string, number>;
  records_deleted: Record<string, number>;
  duration_ms: number | null;
  status: string;
  error_message: string | null;
  triggered_by: string;
}

export interface ArchiveStats {
  archived_orders: number;
  archived_operation_logs: number;
  archived_points_ledger: number;
}

/**
 * 执行数据归档（调用数据库函数）
 */
export async function runArchive(retentionDays: number = 90): Promise<{
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
}> {
  const startTime = Date.now();
  
  try {
    const { data, error } = await supabase.rpc('archive_old_data', {
      retention_days: retentionDays,
    });

    if (error) throw error;

    const duration = Date.now() - startTime;
    
    // Update the latest archive_runs record with duration
    await supabase
      .from('archive_runs')
      .update({ duration_ms: duration })
      .order('run_at', { ascending: false })
      .limit(1);

    return { success: true, result: data as Record<string, unknown> };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * 获取归档执行历史
 */
export async function getArchiveHistory(limit: number = 20): Promise<ArchiveRun[]> {
  const { data, error } = await supabase
    .from('archive_runs')
    .select('*')
    .order('run_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[ArchiveService] Failed to fetch history:', error);
    return [];
  }

  return (data || []) as unknown as ArchiveRun[];
}

/**
 * 获取各归档表的行数统计
 */
export async function getArchiveStats(): Promise<ArchiveStats> {
  const [orders, logs, points] = await Promise.all([
    supabase.from('archived_orders').select('id', { count: 'exact', head: true }),
    supabase.from('archived_operation_logs').select('id', { count: 'exact', head: true }),
    supabase.from('archived_points_ledger').select('id', { count: 'exact', head: true }),
  ]);

  return {
    archived_orders: orders.count ?? 0,
    archived_operation_logs: logs.count ?? 0,
    archived_points_ledger: points.count ?? 0,
  };
}
