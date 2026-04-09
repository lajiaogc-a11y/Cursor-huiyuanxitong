// ============= Operation Logs Hook - react-query Migration =============
// 操作日志管理 Hook - react-query 缓存确保页面切换不重复请求

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE_TIME_LIST_MS } from '@/lib/reactQueryPolicy';
import { getOperationLogsTableRecent, patchOperationLogById } from '@/services/data/auditQueryService';
import { useAuth } from '@/contexts/AuthContext';
import { postOperationLog } from '@/services/staff/staffDataService';
import { parseOperationLogDataField } from '@/lib/operationLogPayload';
import { getCurrentOperatorSync } from '@/services/members/operatorService';

type OperationLogRow = {
  id: string;
  timestamp: string;
  operator_id: string | null;
  operator_account: string;
  operator_role: string;
  module: string;
  operation_type: string;
  object_id: string | null;
  object_description: string | null;
  before_data: unknown;
  after_data: unknown;
  ip_address: string | null;
  is_restored: boolean;
  restored_by: string | null;
  restored_at: string | null;
};

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
  const data = await getOperationLogsTableRecent<OperationLogRow[]>();
  const rows = Array.isArray(data) ? data : [];

  return rows.map((log: OperationLogRow) => ({
    id: log.id,
    timestamp: log.timestamp,
    operatorId: log.operator_id,
    operatorAccount: log.operator_account,
    operatorRole: log.operator_role,
    module: log.module,
    operationType: log.operation_type,
    objectId: log.object_id,
    objectDescription: log.object_description,
    beforeData: parseOperationLogDataField(log.before_data) ?? log.before_data,
    afterData: parseOperationLogDataField(log.after_data) ?? log.after_data,
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
    staleTime: STALE_TIME_LIST_MS,
    retry: 3,
  });

  const addLog = async (log: Omit<OperationLog, 'id' | 'isRestored' | 'restoredBy' | 'restoredAt'>): Promise<boolean> => {
    try {
      await postOperationLog({
        operatorId: log.operatorId,
        operatorAccount: log.operatorAccount,
        operatorRole: log.operatorRole,
        module: log.module,
        operationType: log.operationType,
        objectId: log.objectId,
        objectDescription: log.objectDescription ?? null,
        beforeData: log.beforeData,
        afterData: log.afterData,
        ipAddress: log.ipAddress,
      });
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
      await patchOperationLogById(logId, {
        data: {
          is_restored: true,
          restored_by: employee.id,
          restored_at: new Date().toISOString(),
        },
      });
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

// 全局日志记录函数 - 优先通过后端 API 写入（绕过 RLS）
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
    const currentUser = getCurrentOperatorSync();
    await postOperationLog({
      operatorId: operatorInfo?.id || currentUser.id || null,
      operatorAccount: operatorInfo?.account || currentUser.account || 'system',
      operatorRole: operatorInfo?.role || currentUser.role || 'unknown',
      module,
      operationType,
      objectId,
      objectDescription: objectDescription || null,
      beforeData,
      afterData,
    });
    return true;
  } catch (error) {
    console.error('Failed to log operation:', error);
    return false;
  }
}
