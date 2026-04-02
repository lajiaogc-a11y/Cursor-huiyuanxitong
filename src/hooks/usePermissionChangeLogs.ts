// Hook for managing permission change logs
import { useState, useCallback } from 'react';
import { apiGet, apiPost } from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';

function unwrapSingle<T>(data: unknown): T | null {
  if (data == null) return null;
  if (Array.isArray(data)) return (data[0] as T) ?? null;
  return data as T;
}

export interface PermissionChangeLog {
  id: string;
  changed_at: string;
  changed_by: string | null;
  changed_by_name: string;
  changed_by_role: string;
  target_role: string;
  action_type: 'update' | 'import' | 'apply_template';
  template_name: string | null;
  changes_summary: Array<{
    module: string;
    field: string;
    before: { can_view: boolean; can_edit: boolean; can_delete: boolean };
    after: { can_view: boolean; can_edit: boolean; can_delete: boolean };
  }>;
  before_data: any;
  after_data: any;
  ip_address: string | null;
}

export interface CreateChangeLogParams {
  targetRole: string;
  actionType: 'update' | 'import' | 'apply_template';
  templateName?: string;
  changesSummary: Array<{
    module: string;
    field: string;
    before: { can_view: boolean; can_edit: boolean; can_delete: boolean };
    after: { can_view: boolean; can_edit: boolean; can_delete: boolean };
  }>;
  beforeData?: any;
  afterData?: any;
}

export function usePermissionChangeLogs() {
  const { employee } = useAuth();
  const [logs, setLogs] = useState<PermissionChangeLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchLogs = useCallback(async (limit = 100) => {
    setLoading(true);
    try {
      const data = await apiGet<unknown[]>(
        `/api/data/table/permission_change_logs?select=*&order=changed_at.desc&limit=${limit}`
      );
      setLogs((Array.isArray(data) ? data : []) as unknown as PermissionChangeLog[]);
    } catch (error) {
      console.error('Failed to fetch permission change logs:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const createLog = useCallback(async (params: CreateChangeLogParams) => {
    if (!employee) return null;

    try {
      const inserted = await apiPost<unknown>(`/api/data/table/permission_change_logs`, {
        data: {
          changed_by: employee.id,
          changed_by_name: employee.real_name,
          changed_by_role: employee.role,
          target_role: params.targetRole,
          action_type: params.actionType,
          template_name: params.templateName || null,
          changes_summary: params.changesSummary,
          before_data: params.beforeData || null,
          after_data: params.afterData || null,
        },
      });
      return unwrapSingle(inserted);
    } catch (error) {
      console.error('Failed to create permission change log:', error);
      return null;
    }
  }, [employee]);

  const getLogsByRole = useCallback(async (role: string) => {
    try {
      const data = await apiGet<unknown>(
        `/api/data/table/permission_change_logs?select=*&target_role=eq.${encodeURIComponent(role)}&order=changed_at.desc&limit=50`
      );
      return (Array.isArray(data) ? data : []) as unknown as PermissionChangeLog[];
    } catch (error) {
      console.error('Failed to fetch logs by role:', error);
      return [];
    }
  }, []);

  return {
    logs,
    loading,
    fetchLogs,
    createLog,
    getLogsByRole,
  };
}
