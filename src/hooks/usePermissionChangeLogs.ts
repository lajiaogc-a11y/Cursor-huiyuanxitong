// Hook for managing permission change logs
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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
      const { data, error } = await supabase
        .from('permission_change_logs')
        .select('*')
        .order('changed_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      setLogs((data || []) as unknown as PermissionChangeLog[]);
    } catch (error) {
      console.error('Failed to fetch permission change logs:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const createLog = useCallback(async (params: CreateChangeLogParams) => {
    if (!employee) return null;

    try {
      const { data, error } = await supabase
        .from('permission_change_logs')
        .insert({
          changed_by: employee.id,
          changed_by_name: employee.real_name,
          changed_by_role: employee.role,
          target_role: params.targetRole,
          action_type: params.actionType,
          template_name: params.templateName || null,
          changes_summary: params.changesSummary,
          before_data: params.beforeData || null,
          after_data: params.afterData || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Failed to create permission change log:', error);
      return null;
    }
  }, [employee]);

  const getLogsByRole = useCallback(async (role: string) => {
    try {
      const { data, error } = await supabase
        .from('permission_change_logs')
        .select('*')
        .eq('target_role', role)
        .order('changed_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as unknown as PermissionChangeLog[];
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
