// ============= API Keys 管理 Hook =============
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  status: 'active' | 'disabled' | 'expired';
  permissions: string[];
  ipWhitelist: string[] | null;
  rateLimit: number;
  expiresAt: string | null;
  lastUsedAt: string | null;
  totalRequests: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  remark: string | null;
}

export interface ApiRequestLog {
  id: string;
  apiKeyId: string | null;
  keyPrefix: string | null;
  endpoint: string;
  method: string;
  ipAddress: string | null;
  userAgent: string | null;
  requestParams: Record<string, unknown> | null;
  responseStatus: number;
  responseTimeMs: number | null;
  errorMessage: string | null;
  createdAt: string;
}

// 生成安全的 API Key
function generateApiKey(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = 'fast_';
  for (let i = 0; i < 32; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
}

// SHA-256 哈希
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function useApiKeys() {
  
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [logs, setLogs] = useState<ApiRequestLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);

  const fetchKeys = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setKeys((data || []).map(k => ({
        id: k.id,
        name: k.name,
        keyPrefix: k.key_prefix,
        status: k.status as 'active' | 'disabled' | 'expired',
        permissions: k.permissions as string[],
        ipWhitelist: k.ip_whitelist,
        rateLimit: k.rate_limit,
        expiresAt: k.expires_at,
        lastUsedAt: k.last_used_at,
        totalRequests: Number(k.total_requests),
        createdBy: k.created_by,
        createdAt: k.created_at,
        updatedAt: k.updated_at,
        remark: k.remark,
      })));
    } catch (error) {
      console.error('Failed to fetch API keys:', error);
      toast.error('获取 API Keys 失败');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchLogs = useCallback(async (keyId?: string, limit = 100) => {
    setLogsLoading(true);
    try {
      let query = supabase
        .from('api_request_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (keyId) {
        query = query.eq('api_key_id', keyId);
      }

      const { data, error } = await query;
      if (error) throw error;

      setLogs((data || []).map(l => ({
        id: l.id,
        apiKeyId: l.api_key_id,
        keyPrefix: l.key_prefix,
        endpoint: l.endpoint,
        method: l.method,
        ipAddress: l.ip_address,
        userAgent: l.user_agent,
        requestParams: l.request_params as Record<string, unknown> | null,
        responseStatus: l.response_status,
        responseTimeMs: l.response_time_ms,
        errorMessage: l.error_message,
        createdAt: l.created_at,
      })));
    } catch (error) {
      console.error('Failed to fetch API logs:', error);
      toast.error('获取请求日志失败');
    } finally {
      setLogsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  // 创建新的 API Key（返回明文 key，只显示一次）
  const createKey = async (
    name: string,
    permissions: string[],
    options?: {
      ipWhitelist?: string[];
      rateLimit?: number;
      expiresAt?: string;
      remark?: string;
    }
  ): Promise<{ success: boolean; key?: string; error?: string }> => {
    try {
      const plainKey = generateApiKey();
      const keyHash = await hashApiKey(plainKey);
      const keyPrefix = plainKey.substring(0, 12) + '...';

      const { error } = await supabase.from('api_keys').insert({
        name,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        permissions,
        ip_whitelist: options?.ipWhitelist || null,
        rate_limit: options?.rateLimit || 60,
        expires_at: options?.expiresAt || null,
        remark: options?.remark || null,
      });

      if (error) throw error;

      await fetchKeys();
      toast.success('API Key 创建成功');

      return { success: true, key: plainKey };
    } catch (error) {
      console.error('Failed to create API key:', error);
      toast.error('创建 API Key 失败');
      return { success: false, error: String(error) };
    }
  };

  // 更新 API Key 状态
  const updateKeyStatus = async (keyId: string, status: 'active' | 'disabled'): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('api_keys')
        .update({ status })
        .eq('id', keyId);

      if (error) throw error;

      await fetchKeys();
      toast.success(status === 'active' ? 'API Key 已启用' : 'API Key 已禁用');
      return true;
    } catch (error) {
      console.error('Failed to update API key status:', error);
      toast.error('更新状态失败');
      return false;
    }
  };

  // 更新 API Key 配置
  const updateKey = async (
    keyId: string,
    updates: {
      name?: string;
      permissions?: string[];
      ipWhitelist?: string[] | null;
      rateLimit?: number;
      expiresAt?: string | null;
      remark?: string | null;
    }
  ): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('api_keys')
        .update({
          name: updates.name,
          permissions: updates.permissions,
          ip_whitelist: updates.ipWhitelist,
          rate_limit: updates.rateLimit,
          expires_at: updates.expiresAt,
          remark: updates.remark,
        })
        .eq('id', keyId);

      if (error) throw error;

      await fetchKeys();
      toast.success('API Key 更新成功');
      return true;
    } catch (error) {
      console.error('Failed to update API key:', error);
      toast.error('更新 API Key 失败');
      return false;
    }
  };

  // 删除 API Key
  const deleteKey = async (keyId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', keyId);

      if (error) throw error;

      await fetchKeys();
      toast.success('API Key 已删除');
      return true;
    } catch (error) {
      console.error('Failed to delete API key:', error);
      toast.error('删除 API Key 失败');
      return false;
    }
  };

  // 重新生成 API Key
  const regenerateKey = async (keyId: string): Promise<{ success: boolean; key?: string }> => {
    try {
      const plainKey = generateApiKey();
      const keyHash = await hashApiKey(plainKey);
      const keyPrefix = plainKey.substring(0, 12) + '...';

      const { error } = await supabase
        .from('api_keys')
        .update({
          key_hash: keyHash,
          key_prefix: keyPrefix,
        })
        .eq('id', keyId);

      if (error) throw error;

      await fetchKeys();
      toast.success('API Key 已重新生成');
      return { success: true, key: plainKey };
    } catch (error) {
      console.error('Failed to regenerate API key:', error);
      toast.error('重新生成失败');
      return { success: false };
    }
  };

  return {
    keys,
    logs,
    loading,
    logsLoading,
    fetchKeys,
    fetchLogs,
    createKey,
    updateKey,
    updateKeyStatus,
    deleteKey,
    regenerateKey,
  };
}

// 权限选项
export const API_PERMISSION_OPTIONS = [
  { value: 'all', label: '全部权限', description: '访问所有 API 接口' },
  { value: 'members', label: '会员管理', description: '访问会员列表和详情' },
  { value: 'activity_data', label: '活动数据', description: '访问活动汇总、赠送记录、积分明细' },
  { value: 'orders', label: '订单管理', description: '访问订单列表、详情和统计' },
  { value: 'merchants', label: '商家数据', description: '访问卡商和代付商家列表' },
  { value: 'referrals', label: '推荐关系', description: '访问推荐关系数据' },
];
