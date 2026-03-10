// Hook for managing permission versions
import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface PermissionVersion {
  id: string;
  version_name: string;
  version_description: string | null;
  created_at: string;
  created_by: string | null;
  created_by_name: string;
  target_role: string;
  permissions_snapshot: Array<{
    module_name: string;
    field_name: string;
    can_view: boolean;
    can_edit: boolean;
    can_delete: boolean;
  }>;
  is_auto_backup: boolean;
}

export interface CreateVersionParams {
  versionName: string;
  versionDescription?: string;
  targetRole: string;
  permissionsSnapshot: Array<{
    module_name: string;
    field_name: string;
    can_view: boolean;
    can_edit: boolean;
    can_delete: boolean;
  }>;
  isAutoBackup?: boolean;
}

export function usePermissionVersions() {
  const { employee } = useAuth();
  const [versions, setVersions] = useState<PermissionVersion[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchVersions = useCallback(async (role?: string) => {
    setLoading(true);
    try {
      let query = supabase
        .from('permission_versions')
        .select('*')
        .order('created_at', { ascending: false });

      if (role) {
        query = query.eq('target_role', role);
      }

      const { data, error } = await query.limit(50);

      if (error) throw error;
      setVersions((data || []) as unknown as PermissionVersion[]);
    } catch (error) {
      console.error('Failed to fetch permission versions:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const createVersion = useCallback(async (params: CreateVersionParams) => {
    if (!employee) return null;

    try {
      const { data, error } = await supabase
        .from('permission_versions')
        .insert({
          version_name: params.versionName,
          version_description: params.versionDescription || null,
          created_by: employee.id,
          created_by_name: employee.real_name,
          target_role: params.targetRole,
          permissions_snapshot: params.permissionsSnapshot,
          is_auto_backup: params.isAutoBackup || false,
        })
        .select()
        .single();

      if (error) throw error;
      return data as unknown as PermissionVersion;
    } catch (error) {
      console.error('Failed to create permission version:', error);
      return null;
    }
  }, [employee]);

  const deleteVersion = useCallback(async (versionId: string) => {
    try {
      const { error } = await supabase
        .from('permission_versions')
        .delete()
        .eq('id', versionId);

      if (error) throw error;
      setVersions(prev => prev.filter(v => v.id !== versionId));
      return true;
    } catch (error) {
      console.error('Failed to delete permission version:', error);
      return false;
    }
  }, []);

  const getVersionById = useCallback(async (versionId: string) => {
    try {
      const { data, error } = await supabase
        .from('permission_versions')
        .select('*')
        .eq('id', versionId)
        .single();

      if (error) throw error;
      return data as unknown as PermissionVersion;
    } catch (error) {
      console.error('Failed to fetch version:', error);
      return null;
    }
  }, []);

  return {
    versions,
    loading,
    fetchVersions,
    createVersion,
    deleteVersion,
    getVersionById,
  };
}
