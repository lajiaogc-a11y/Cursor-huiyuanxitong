// ============= Webhook 管理 Hook =============
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Webhook {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  events: string[];
  status: 'active' | 'disabled';
  headers: Record<string, string>;
  retryCount: number;
  timeoutMs: number;
  lastTriggeredAt: string | null;
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  remark: string | null;
}

export interface WebhookDeliveryLog {
  id: string;
  webhookId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  responseStatus: number | null;
  responseBody: string | null;
  responseTimeMs: number | null;
  attemptCount: number;
  success: boolean;
  errorMessage: string | null;
  createdAt: string;
}

export interface ApiDailyStats {
  statDate: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errorRate: number;
  avgResponseTime: number;
}

export interface ApiEndpointStats {
  endpoint: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgResponseTime: number;
}

// Webhook 事件类型
export const WEBHOOK_EVENT_TYPES = [
  { value: 'order.created', label: '新订单创建', description: '当有新订单创建时触发' },
  { value: 'order.completed', label: '订单完成', description: '当订单状态变为完成时触发' },
  { value: 'order.cancelled', label: '订单取消', description: '当订单被取消时触发' },
  { value: 'member.created', label: '新会员注册', description: '当有新会员创建时触发' },
  { value: 'member.updated', label: '会员信息更新', description: '当会员信息被修改时触发' },
  { value: 'points.issued', label: '积分发放', description: '当积分被发放时触发' },
  { value: 'points.redeemed', label: '积分兑换', description: '当积分被兑换时触发' },
  { value: 'gift.created', label: '活动赠送', description: '当有活动赠送记录时触发' },
];

export function useWebhooks() {
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [deliveryLogs, setDeliveryLogs] = useState<WebhookDeliveryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [logsLoading, setLogsLoading] = useState(false);

  const fetchWebhooks = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('webhooks')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setWebhooks((data || []).map(w => ({
        id: w.id,
        name: w.name,
        url: w.url,
        secret: w.secret,
        events: w.events || [],
        status: w.status as 'active' | 'disabled',
        headers: (w.headers as Record<string, string>) || {},
        retryCount: w.retry_count,
        timeoutMs: w.timeout_ms,
        lastTriggeredAt: w.last_triggered_at,
        totalDeliveries: Number(w.total_deliveries),
        successfulDeliveries: Number(w.successful_deliveries),
        failedDeliveries: Number(w.failed_deliveries),
        createdBy: w.created_by,
        createdAt: w.created_at,
        updatedAt: w.updated_at,
        remark: w.remark,
      })));
    } catch (error) {
      console.error('Failed to fetch webhooks:', error);
      toast.error('获取 Webhook 失败');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchDeliveryLogs = useCallback(async (webhookId?: string, limit = 50) => {
    setLogsLoading(true);
    try {
      let query = supabase
        .from('webhook_delivery_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (webhookId) {
        query = query.eq('webhook_id', webhookId);
      }

      const { data, error } = await query;
      if (error) throw error;

      setDeliveryLogs((data || []).map(l => ({
        id: l.id,
        webhookId: l.webhook_id,
        eventType: l.event_type,
        payload: l.payload as Record<string, unknown>,
        responseStatus: l.response_status,
        responseBody: l.response_body,
        responseTimeMs: l.response_time_ms,
        attemptCount: l.attempt_count,
        success: l.success,
        errorMessage: l.error_message,
        createdAt: l.created_at,
      })));
    } catch (error) {
      console.error('Failed to fetch delivery logs:', error);
      toast.error('获取投递日志失败');
    } finally {
      setLogsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchWebhooks();
  }, [fetchWebhooks]);

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
      const { error } = await supabase.from('webhooks').insert({
        name,
        url,
        events,
        secret: options?.secret || null,
        headers: options?.headers || {},
        retry_count: options?.retryCount || 3,
        timeout_ms: options?.timeoutMs || 5000,
        remark: options?.remark || null,
      });

      if (error) throw error;

      await fetchWebhooks();
      toast.success('Webhook 创建成功');
      return true;
    } catch (error) {
      console.error('Failed to create webhook:', error);
      toast.error('创建 Webhook 失败');
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
      const { error } = await supabase
        .from('webhooks')
        .update({
          name: updates.name,
          url: updates.url,
          events: updates.events,
          secret: updates.secret,
          headers: updates.headers,
          retry_count: updates.retryCount,
          timeout_ms: updates.timeoutMs,
          status: updates.status,
          remark: updates.remark,
        })
        .eq('id', webhookId);

      if (error) throw error;

      await fetchWebhooks();
      toast.success('Webhook 更新成功');
      return true;
    } catch (error) {
      console.error('Failed to update webhook:', error);
      toast.error('更新 Webhook 失败');
      return false;
    }
  };

  const deleteWebhook = async (webhookId: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('webhooks')
        .delete()
        .eq('id', webhookId);

      if (error) throw error;

      await fetchWebhooks();
      toast.success('Webhook 已删除');
      return true;
    } catch (error) {
      console.error('Failed to delete webhook:', error);
      toast.error('删除 Webhook 失败');
      return false;
    }
  };

  const testWebhook = async (webhookId: string): Promise<{ success: boolean; message: string }> => {
    try {
      const { data, error } = await supabase.functions.invoke('webhook-processor', {
        body: { action: 'test', webhookId },
      });

      if (error) throw error;

      return data;
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
    fetchWebhooks,
    fetchDeliveryLogs,
    createWebhook,
    updateWebhook,
    deleteWebhook,
    testWebhook,
  };
}

// API 统计 Hook
export function useApiStats() {
  const [dailyStats, setDailyStats] = useState<ApiDailyStats[]>([]);
  const [endpointStats, setEndpointStats] = useState<ApiEndpointStats[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async (days = 7) => {
    setLoading(true);
    try {
      const [dailyRes, endpointRes] = await Promise.all([
        supabase.rpc('get_api_daily_stats', { p_days: days }),
        supabase.rpc('get_api_endpoint_stats', { p_days: days }),
      ]);

      if (dailyRes.error) throw dailyRes.error;
      if (endpointRes.error) throw endpointRes.error;

      setDailyStats((dailyRes.data || []).map((d: Record<string, unknown>) => ({
        statDate: d.stat_date as string,
        totalRequests: Number(d.total_requests),
        successfulRequests: Number(d.successful_requests),
        failedRequests: Number(d.failed_requests),
        errorRate: Number(d.error_rate) || 0,
        avgResponseTime: Number(d.avg_response_time) || 0,
      })));

      setEndpointStats((endpointRes.data || []).map((e: Record<string, unknown>) => ({
        endpoint: e.endpoint as string,
        totalRequests: Number(e.total_requests),
        successfulRequests: Number(e.successful_requests),
        failedRequests: Number(e.failed_requests),
        avgResponseTime: Number(e.avg_response_time) || 0,
      })));
    } catch (error) {
      console.error('Failed to fetch API stats:', error);
      toast.error('获取统计数据失败');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return {
    dailyStats,
    endpointStats,
    loading,
    refetch: fetchStats,
  };
}
