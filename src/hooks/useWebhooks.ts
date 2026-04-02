// ============= Webhook 管理 Hook =============
import { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { rpcTestWebhook } from '@/services/webhooks/webhookAdminRpcService';
import type { WebhookDeliveryLog } from '@/services/webhooks/webhookTableService';
import {
  listWebhooks,
  listWebhookDeliveryLogs,
  createWebhookRecord,
  patchWebhookRecord,
  deleteWebhookRecord,
} from '@/services/webhooks/webhookTableService';
import { fetchApiUsageStats, type ApiDailyStats, type ApiEndpointStats } from '@/services/observability/apiUsageStatsService';
import { notify } from "@/lib/notifyHub";
import { useLanguage } from '@/contexts/LanguageContext';

const STALE_TIME = 5 * 60 * 1000;

export type { Webhook, WebhookDeliveryLog } from '@/services/webhooks/webhookTableService';
export type { ApiDailyStats, ApiEndpointStats };

// Webhook 事件类型
export const WEBHOOK_EVENT_TYPES = [
  { value: 'order.created', label: '新订单创建', labelEn: 'Order Created', description: '当有新订单创建时触发', descriptionEn: 'Triggered when a new order is created' },
  { value: 'order.completed', label: '订单完成', labelEn: 'Order Completed', description: '当订单状态变为完成时触发', descriptionEn: 'Triggered when an order is completed' },
  { value: 'order.cancelled', label: '订单取消', labelEn: 'Order Cancelled', description: '当订单被取消时触发', descriptionEn: 'Triggered when an order is cancelled' },
  { value: 'member.created', label: '新会员注册', labelEn: 'Member Created', description: '当有新会员创建时触发', descriptionEn: 'Triggered when a new member is created' },
  { value: 'member.updated', label: '会员信息更新', labelEn: 'Member Updated', description: '当会员信息被修改时触发', descriptionEn: 'Triggered when member info is updated' },
  { value: 'points.issued', label: '积分发放', labelEn: 'Points Issued', description: '当积分被发放时触发', descriptionEn: 'Triggered when points are issued' },
  { value: 'points.redeemed', label: '积分兑换', labelEn: 'Points Redeemed', description: '当积分被兑换时触发', descriptionEn: 'Triggered when points are redeemed' },
  { value: 'gift.created', label: '活动赠送', labelEn: 'Gift Created', description: '当有活动赠送记录时触发', descriptionEn: 'Triggered when a gift record is created' },
];

export function useWebhooks() {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const [deliveryLogs, setDeliveryLogs] = useState<WebhookDeliveryLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const webhooksQuery = useQuery({
    queryKey: ['webhooks'],
    queryFn: listWebhooks,
    staleTime: STALE_TIME,
  });

  const webhooks = webhooksQuery.data ?? [];
  const loading = webhooksQuery.isLoading;
  const invalidateWebhooks = () => queryClient.invalidateQueries({ queryKey: ['webhooks'] });

  const fetchDeliveryLogs = useCallback(async (webhookId?: string, limit = 50) => {
    setLogsLoading(true);
    try {
      const rows = await listWebhookDeliveryLogs(webhookId, limit);
      setDeliveryLogs(rows);
    } catch (error) {
      console.error('Failed to fetch delivery logs:', error);
      notify.error(t('获取投递日志失败', 'Failed to fetch delivery logs'));
    } finally {
      setLogsLoading(false);
    }
  }, [t]);

  const createWebhook = async (
    name: string,
    url: string,
    events: string[],
    options?: {
      secret?: string;
      headers?: Record<string, string>;
      retryCount?: number;
      timeoutMs?: number;
      remark?: string;
    }
  ): Promise<boolean> => {
    try {
      await createWebhookRecord({
        name,
        url,
        events,
        secret: options?.secret || null,
        headers: options?.headers || {},
        retry_count: options?.retryCount || 3,
        timeout_ms: options?.timeoutMs || 5000,
        remark: options?.remark || null,
      });

      invalidateWebhooks();
      notify.success(t('Webhook 创建成功', 'Webhook created successfully'));
      return true;
    } catch (error) {
      console.error('Failed to create webhook:', error);
      notify.error(t('创建 Webhook 失败', 'Failed to create Webhook'));
      return false;
    }
  };

  const updateWebhook = async (
    webhookId: string,
    updates: Partial<{
      name: string;
      url: string;
      events: string[];
      secret: string | null;
      headers: Record<string, string>;
      retryCount: number;
      timeoutMs: number;
      status: 'active' | 'disabled';
      remark: string | null;
    }>
  ): Promise<boolean> => {
    try {
      await patchWebhookRecord(webhookId, {
        name: updates.name,
        url: updates.url,
        events: updates.events,
        secret: updates.secret,
        headers: updates.headers,
        retry_count: updates.retryCount,
        timeout_ms: updates.timeoutMs,
        status: updates.status,
        remark: updates.remark,
      });

      invalidateWebhooks();
      notify.success(t('Webhook 更新成功', 'Webhook updated successfully'));
      return true;
    } catch (error) {
      console.error('Failed to update webhook:', error);
      notify.error(t('更新 Webhook 失败', 'Failed to update Webhook'));
      return false;
    }
  };

  const deleteWebhook = async (webhookId: string): Promise<boolean> => {
    try {
      await deleteWebhookRecord(webhookId);

      invalidateWebhooks();
      notify.success(t('Webhook 已删除', 'Webhook deleted'));
      return true;
    } catch (error) {
      console.error('Failed to delete webhook:', error);
      notify.error(t('删除 Webhook 失败', 'Failed to delete Webhook'));
      return false;
    }
  };

  const testWebhook = async (webhookId: string): Promise<{ success: boolean; message: string }> => {
    try {
      return await rpcTestWebhook(webhookId);
    } catch (error) {
      console.error('Failed to test webhook:', error);
      return { success: false, message: String(error) };
    }
  };

  return {
    webhooks,
    deliveryLogs,
    loading,
    logsLoading,
    fetchWebhooks: invalidateWebhooks,
    fetchDeliveryLogs,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    testWebhook,
  };
}

// API 统计 Hook
const STALE_TIME_STATS = 5 * 60 * 1000;

export function useApiStats(days = 7) {
  const query = useQuery({
    queryKey: ['api-stats', days],
    queryFn: () => fetchApiUsageStats(days),
    staleTime: STALE_TIME_STATS,
  });

  const dailyStats = query.data?.dailyStats ?? [];
  const endpointStats = query.data?.endpointStats ?? [];

  return {
    dailyStats,
    endpointStats,
    loading: query.isLoading,
    refetch: (d?: number) => query.refetch(),
  };
}
