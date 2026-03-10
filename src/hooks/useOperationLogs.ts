// ============= Operation Logs Hook - react-query Migration =============
// 操作日志管理 Hook - react-query 缓存确保页面切换不重复请求

import { useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface OperationLog {
  id: string;
  timestamp: string;
  operatorId: string | null;
  operatorAccount: string;
  operatorRole: string;
  module: string;
  operationType: string;
  objectId: string | null;
  objectDescription: string | null;
  beforeData: any;
  afterData: any;
  ipAddress: string | null;
  isRestored: boolean;
  restoredBy: string | null;
  restoredAt: string | null;
}

// Standalone fetch function (used by useQuery and prefetch)
export async function fetchOperationLogsFromDb(): Promise<OperationLog[]> {
  const { data, error } = await supabase
    .from('operation_logs')
    .select('*')
    .order('timestamp', { ascending: false })
    .range(0, 4999);

  if (error) throw error;

  return (data || []).map(log => ({
    id: log.id,
    timestamp: log.timestamp,
    operatorId: log.operator_id,
    operatorAccount: log.operator_account,
    operatorRole: log.operator_role,
    module: log.module,
    operationType: log.operation_type,
    objectId: log.object_id,
    objectDescription: log.object_description,
    beforeData: log.before_data,
    afterData: log.after_data,
    ipAddress: log.ip_address,
    isRestored: log.is_restored,
    restoredBy: log.restored_by,
    restoredAt: log.restored_at,
  }));
}

export function useOperationLogs() {
  const { employee } = useAuth();
  const queryClient = useQueryClient();

  const { data: logs = [], isLoading: loading } = useQuery({
    queryKey: ['operation-logs'],
    queryFn: fetchOperationLogsFromDb,
  });

  // Realtime subscription -> invalidate cache
  useEffect(() => {
    const channel = supabase
      .channel('operation-logs-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operation_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['operation-logs'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const addLog = async (log: Omit<OperationLog, 'id' | 'isRestored' | 'restoredBy' | 'restoredAt'>): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('operation_logs')
        .insert({
          timestamp: log.timestamp || new Date().toISOString(),
          operator_id: log.operatorId,
          operator_account: log.operatorAccount,
          operator_role: log.operatorRole,
          module: log.module,
          operation_type: log.operationType,
          object_id: log.objectId,
          object_description: log.objectDescription,
          before_data: log.beforeData,
          after_data: log.afterData,
          ip_address: log.ipAddress,
        });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Failed to add operation log:', error);
      return false;
    }
  };

  // 恢复操作 - 仅管理员可用
  const restoreLog = async (logId: string): Promise<boolean> => {
    if (employee?.role !== 'admin') {
      console.error('Only admin can restore logs');
      return false;
    }

    try {
      const { error } = await supabase
        .from('operation_logs')
        .update({
          is_restored: true,
          restored_by: employee.id,
          restored_at: new Date().toISOString(),
        })
        .eq('id', logId);

      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['operation-logs'] });
      return true;
    } catch (error) {
      console.error('Failed to restore log:', error);
      return false;
    }
  };

  return {
    logs,
    loading,
    addLog,
    restoreLog,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['operation-logs'] }),
    isAdmin: employee?.role === 'admin',
  };
}

// 全局日志记录函数 - 供其他模块调用
export async function logOperationToDb(
  module: string,
  operationType: string,
  objectId: string | null,
  beforeData: any,
  afterData: any,
  objectDescription?: string,
  operatorInfo?: { id?: string; account: string; role: string }
): Promise<boolean> {
  try {
    const { getCurrentOperatorSync } = await import('@/services/operatorService');
    const currentUser = getCurrentOperatorSync();
    
    const { error } = await supabase
      .from('operation_logs')
      .insert({
        timestamp: new Date().toISOString(),
        operator_id: operatorInfo?.id || currentUser.id || null,
        operator_account: operatorInfo?.account || currentUser.account || 'system',
        operator_role: operatorInfo?.role || currentUser.role || 'unknown',
        module,
        operation_type: operationType,
        object_id: objectId,
        object_description: objectDescription || null,
        before_data: beforeData,
        after_data: afterData,
      });

    if (error) throw error;
    return true;
  } catch (error) {
    console.error('Failed to log operation:', error);
    return false;
  }
}
