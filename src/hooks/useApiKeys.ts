// ============= API Keys 管理 Hook =============
import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ApiRequestLog } from '@/services/apiKeys/apiKeyService';
import {
  listApiKeys,
  listApiRequestLogs,
  createApiKeyRecord,
  patchApiKeyRecord,
  deleteApiKeyRecord,
  generateApiKey,
  hashApiKey,
} from '@/services/apiKeys/apiKeyService';
import { notify } from "@/lib/notifyHub";
import { useLanguage } from '@/contexts/LanguageContext';
import { ApiError } from '@/api/client';

const STALE_TIME = 5 * 60 * 1000;

export type { ApiKey, ApiRequestLog } from '@/services/apiKeys/apiKeyService';

export function useApiKeys() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const [logs, setLogs] = useState<ApiRequestLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const keysQuery = useQuery({
    queryKey: ['api-keys'],
    queryFn: listApiKeys,
    staleTime: STALE_TIME,
  });

  const keys = keysQuery.data ?? [];
  const loading = keysQuery.isLoading;
  const invalidateKeys = () => queryClient.invalidateQueries({ queryKey: ['api-keys'] });

  const fetchLogs = useCallback(async (keyId?: string, limit = 100) => {
    setLogsLoading(true);
    try {
      const rows = await listApiRequestLogs(keyId, limit);
      setLogs(rows);
    } catch (error) {
      console.error('Failed to fetch API logs:', error);
      notify.error(t('获取请求日志失败', 'Failed to fetch request logs'));
    } finally {
      setLogsLoading(false);
    }
  }, [t]);

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

      await createApiKeyRecord({
        name,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        permissions,
        ip_whitelist: options?.ipWhitelist || null,
        rate_limit: options?.rateLimit || 60,
        expires_at: options?.expiresAt || null,
        remark: options?.remark || null,
      });

      invalidateKeys();
      notify.success(t('API Key 创建成功', 'API Key created successfully'));

      return { success: true, key: plainKey };
    } catch (error) {
      console.error('Failed to create API key:', error);
      const detail =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : String(error);
      notify.error(
        detail
          ? `${t('创建 API Key 失败', 'Failed to create API Key')}: ${detail}`
          : t('创建 API Key 失败', 'Failed to create API Key')
      );
      return { success: false, error: detail };
    }
  };

  // 更新 API Key 状态
  const updateKeyStatus = async (keyId: string, status: 'active' | 'disabled'): Promise<boolean> => {
    try {
      await patchApiKeyRecord(keyId, { status });

      invalidateKeys();
      notify.success(status === 'active' ? t('API Key 已启用', 'API Key enabled') : t('API Key 已禁用', 'API Key disabled'));
      return true;
    } catch (error) {
      console.error('Failed to update API key status:', error);
      notify.error(t('更新状态失败', 'Failed to update status'));
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
      await patchApiKeyRecord(keyId, {
        name: updates.name,
        permissions: updates.permissions,
        ip_whitelist: updates.ipWhitelist,
        rate_limit: updates.rateLimit,
        expires_at: updates.expiresAt,
        remark: updates.remark,
      });

      invalidateKeys();
      notify.success(t('API Key 更新成功', 'API Key updated successfully'));
      return true;
    } catch (error) {
      console.error('Failed to update API key:', error);
      notify.error(t('更新 API Key 失败', 'Failed to update API Key'));
      return false;
    }
  };

  // 删除 API Key
  const deleteKey = async (keyId: string): Promise<boolean> => {
    try {
      await deleteApiKeyRecord(keyId);

      invalidateKeys();
      notify.success(t('API Key 已删除', 'API Key deleted'));
      return true;
    } catch (error) {
      console.error('Failed to delete API key:', error);
      notify.error(t('删除 API Key 失败', 'Failed to delete API Key'));
      return false;
    }
  };

  // 重新生成 API Key
  const regenerateKey = async (keyId: string): Promise<{ success: boolean; key?: string }> => {
    try {
      const plainKey = generateApiKey();
      const keyHash = await hashApiKey(plainKey);
      const keyPrefix = plainKey.substring(0, 12) + '...';

      await patchApiKeyRecord(keyId, {
        key_hash: keyHash,
        key_prefix: keyPrefix,
      });

      invalidateKeys();
      notify.success(t('API Key 已重新生成', 'API Key regenerated'));
      return { success: true, key: plainKey };
    } catch (error) {
      console.error('Failed to regenerate API key:', error);
      notify.error(t('重新生成失败', 'Failed to regenerate'));
      return { success: false };
    }
  };

  return {
    keys,
    logs,
    loading,
    logsLoading,
    fetchLogs,
    createKey,
    updateKey,
    updateKeyStatus,
    deleteKey,
    regenerateKey,
  };
}

export type ApiPermissionOption = {
  value: string;
  label: string;
  labelEn: string;
  description: string;
  descriptionEn: string;
};

export type ApiPermissionGroup = {
  title: string;
  titleEn: string;
  options: ApiPermissionOption[];
};

/** 分组展示；对外 Edge external-api 的 hasPermission 与这些 value 对齐 */
export const API_PERMISSION_GROUPS: ApiPermissionGroup[] = [
  {
    title: '全局',
    titleEn: 'Global',
    options: [
      {
        value: 'all',
        label: '全部权限',
        labelEn: 'All permissions',
        description: '访问所有对外只读 API 路径',
        descriptionEn: 'Access all external read-only API routes',
      },
    ],
  },
  {
    title: '会员',
    titleEn: 'Members',
    options: [
      {
        value: 'members',
        label: '会员管理',
        labelEn: 'Members',
        description: '会员列表与详情（网关别名：member_management）',
        descriptionEn: 'Member list & detail (alias: member_management)',
      },
    ],
  },
  {
    title: '活动与积分',
    titleEn: 'Activity & points',
    options: [
      {
        value: 'activity_data',
        label: '活动数据（全部）',
        labelEn: 'Activity (full)',
        description: '汇总、活动行、赠送、积分等全部活动相关端点',
        descriptionEn: 'All activity endpoints: summary, list, gifts, points',
      },
      {
        value: 'activity_summary',
        label: '活动汇总',
        labelEn: 'Activity summary',
        description: '仅 /activity、/activity/summary',
        descriptionEn: 'Only /activity and /activity/summary',
      },
      {
        value: 'activity_list',
        label: '活动行列表',
        labelEn: 'Activity rows',
        description: '仅 /activity/list',
        descriptionEn: 'Only /activity/list',
      },
      {
        value: 'gift_records',
        label: '赠送记录',
        labelEn: 'Gift records',
        description: '仅 /activity/gifts',
        descriptionEn: 'Only /activity/gifts',
      },
      {
        value: 'points_ledger',
        label: '积分流水',
        labelEn: 'Points ledger',
        description: '仅 /activity/points',
        descriptionEn: 'Only /activity/points',
      },
    ],
  },
  {
    title: '订单',
    titleEn: 'Orders',
    options: [
      {
        value: 'orders',
        label: '订单管理（全部）',
        labelEn: 'Orders (full)',
        description: '列表、详情与统计（网关别名：order_management）',
        descriptionEn: 'List, detail & stats (alias: order_management)',
      },
      {
        value: 'order_list',
        label: '订单列表',
        labelEn: 'Order list',
        description: '仅 /orders、/orders/list',
        descriptionEn: 'Only /orders and /orders/list',
      },
      {
        value: 'order_detail',
        label: '订单详情',
        labelEn: 'Order detail',
        description: '仅 /orders/detail',
        descriptionEn: 'Only /orders/detail',
      },
      {
        value: 'order_stats',
        label: '订单统计',
        labelEn: 'Order statistics',
        description: '仅 /orders/stats',
        descriptionEn: 'Only /orders/stats',
      },
    ],
  },
  {
    title: '商家与渠道',
    titleEn: 'Merchants',
    options: [
      {
        value: 'merchants',
        label: '商家数据',
        labelEn: 'Merchants',
        description: '卡商与代付列表（网关别名：merchant_management）',
        descriptionEn: 'Vendors & providers (alias: merchant_management)',
      },
    ],
  },
  {
    title: '推荐',
    titleEn: 'Referrals',
    options: [
      {
        value: 'referrals',
        label: '推荐关系',
        labelEn: 'Referrals',
        description: '推荐关系列表（网关别名：referral_management）',
        descriptionEn: 'Referral list (alias: referral_management)',
      },
    ],
  },
];

export const API_PERMISSION_OPTIONS: ApiPermissionOption[] = API_PERMISSION_GROUPS.flatMap((g) => g.options);
