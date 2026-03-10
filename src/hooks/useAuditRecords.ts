// ============= Audit Records Hook - react-query Migration =============
// react-query 缓存确保页面切换不重复请求

import { useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { logOperation } from '@/stores/auditLogStore';
import { Json } from '@/integrations/supabase/types';

export interface AuditRecord {
  id: string;
  target_table: string;
  target_id: string;
  action_type: string;
  old_data: Json | null;
  new_data: Json;
  submitter_id: string | null;
  reviewer_id: string | null;
  review_time: string | null;
  review_comment: string | null;
  status: string;
  created_at: string;
  submitter_name?: string;
  reviewer_name?: string;
}

export interface LegacyAuditItem {
  id: string;
  timestamp: string;
  operator: string;
  operatorId: string;
  module: string;
  field: string;
  fieldLabel: string;
  oldValue: string;
  newValue: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewer?: string;
  reviewTime?: string;
  rejectReason?: string;
  targetId: string;
  targetDescription?: string;
  originalData?: any;
}

const TABLE_TO_MODULE: Record<string, string> = {
  orders: '订单管理',
  members: '会员管理',
  activity: '活动赠送',
  activity_gifts: '活动赠送',
};

const FIELD_LABELS: Record<string, Record<string, string>> = {
  orders: {
    phone_number: '电话号码', member_code: '会员编号', card_value: '卡片价值',
    actual_payment: '实付金额', exchange_rate: '外币汇率', foreign_rate: '外币汇率',
    card_type: '卡片类型', order_type: '卡片类型', vendor: '卡商', vendor_id: '卡商',
    card_merchant_id: '卡商', payment_provider: '代付商家', payment_provider_id: '代付商家',
    fee: '手续费', currency: '币种', remark: '备注', sales_person: '业务员',
    sales_user_id: '业务员', cancel_button: '取消按钮', delete_button: '删除按钮',
  },
  members: {
    phone_number: '电话号码', member_code: '会员编号', member_level: '会员等级',
    remark: '备注', common_cards: '常交易卡', currency_preferences: '币种偏好',
    bank_card: '银行卡', customer_feature: '客户特点', source: '客户来源',
    source_id: '客户来源', referrer: '推荐人', recorder: '记录人',
    recorder_id: '记录人', points: '积分', delete_button: '删除按钮',
  },
  activity: {
    currency: '币种', amount: '金额', rate: '汇率', phone_number: '电话号码',
    payment_agent: '代付商家', gift_type: '类型', remark: '备注', delete_button: '删除按钮',
  },
  activity_gifts: {
    currency: '币种', amount: '金额', rate: '汇率', phone_number: '电话号码',
    payment_agent: '代付商家', gift_type: '类型', remark: '备注', delete_button: '删除按钮',
  },
};

function formatValue(value: any): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function convertToLegacyItem(record: AuditRecord): LegacyAuditItem {
  const module = TABLE_TO_MODULE[record.target_table] || record.target_table;
  const fieldLabels = FIELD_LABELS[record.target_table] || {};
  const newData = record.new_data as Record<string, any> || {};
  const oldData = record.old_data as Record<string, any> || {};
  const changedFields = Object.keys(newData);
  const fieldKey = changedFields[0] || 'unknown';
  const fieldLabel = fieldLabels[fieldKey] || fieldKey;
  const oldValue = formatValue(oldData[fieldKey]);
  const newValue = formatValue(newData[fieldKey]);

  return {
    id: record.id,
    timestamp: record.created_at,
    operator: record.submitter_name || '未知',
    operatorId: record.submitter_id || '',
    module,
    field: fieldLabel,
    fieldLabel,
    oldValue,
    newValue,
    status: record.status as 'pending' | 'approved' | 'rejected',
    reviewer: record.reviewer_name,
    reviewTime: record.review_time || undefined,
    rejectReason: record.review_comment || undefined,
    targetId: record.target_id,
    originalData: { id: record.target_id, ...oldData },
  };
}

export interface AuditRecordsFetchParams {
  page?: number;
  pageSize?: number;
  status?: 'pending' | 'approved' | 'rejected';
  dateFrom?: string;
  dateTo?: string;
}

// Standalone fetch function - 服务端分页，每页 50 条
async function fetchAuditRecordsFromDb(params?: AuditRecordsFetchParams): Promise<{
  records: AuditRecord[];
  legacyItems: LegacyAuditItem[];
  totalCount: number;
}> {
  const page = params?.page ?? 1;
  const pageSize = Math.min(params?.pageSize ?? 50, 100);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('audit_records')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (params?.status) {
    query = query.eq('status', params.status);
  }
  if (params?.dateFrom) {
    query = query.gte('created_at', params.dateFrom);
  }
  if (params?.dateTo) {
    query = query.lte('created_at', params.dateTo);
  }

  const { data, error, count } = await query.range(from, to);

  if (error) throw error;

  const submitterIds = [...new Set((data || []).map(r => r.submitter_id).filter(Boolean))];
  const reviewerIds = [...new Set((data || []).map(r => r.reviewer_id).filter(Boolean))];
  const allIds = [...new Set([...submitterIds, ...reviewerIds])];

  let employeeMap: Record<string, string> = {};
  if (allIds.length > 0) {
    const { data: employees } = await supabase
      .from('employees')
      .select('id, real_name')
      .in('id', allIds);
    if (employees) {
      employeeMap = Object.fromEntries(employees.map(e => [e.id, e.real_name]));
    }
  }

  const enrichedRecords: AuditRecord[] = (data || []).map(record => ({
    ...record,
    submitter_name: record.submitter_id ? employeeMap[record.submitter_id] : undefined,
    reviewer_name: record.reviewer_id ? employeeMap[record.reviewer_id] : undefined,
  }));

  return {
    records: enrichedRecords,
    legacyItems: enrichedRecords.map(convertToLegacyItem),
    totalCount: count ?? 0,
  };
}

async function fetchPendingAuditCount(): Promise<number> {
  const { count, error } = await supabase
    .from('audit_records')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) return 0;
  return count ?? 0;
}

export function useAuditRecords(params?: AuditRecordsFetchParams) {
  const { employee } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading: loading } = useQuery({
    queryKey: ['audit-records', params?.page, params?.pageSize, params?.status, params?.dateFrom, params?.dateTo],
    queryFn: () => fetchAuditRecordsFromDb(params),
    enabled: !!employee,
  });

  const records = data?.records ?? [];
  const legacyItems = data?.legacyItems ?? [];
  const totalCount = data?.totalCount ?? 0;

  const { data: pendingCountData } = useQuery({
    queryKey: ['audit-pending-count'],
    queryFn: fetchPendingAuditCount,
    enabled: !!employee,
  });
  const pendingCount = pendingCountData ?? 0;

  // Realtime subscription -> invalidate cache
  useEffect(() => {
    if (!employee) return;

    const channel = supabase
      .channel('audit-records-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_records' }, () => {
        queryClient.invalidateQueries({ queryKey: ['audit-records'] });
        queryClient.invalidateQueries({ queryKey: ['audit-pending-count'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [employee, queryClient]);

  const approveRecord = useCallback(async (recordId: string): Promise<boolean> => {
    if (!employee) return false;

    try {
      const { data: record, error: fetchError } = await supabase
        .from('audit_records')
        .select('*')
        .eq('id', recordId)
        .single();

      if (fetchError || !record) {
        toast.error('找不到审核记录');
        return false;
      }

      // 并发校验：仅允许审批仍为 pending 的记录，避免重复审批
      if (record.status !== 'pending') {
        toast.error('该记录已被处理，无法重复审批');
        return false;
      }

      const newData = record.new_data as Record<string, any>;
      const targetTable = record.target_table;
      const targetId = record.target_id;

      const { error: updateError } = await supabase
        .from(targetTable as any)
        .update(newData)
        .eq('id', targetId);

      if (updateError) {
        console.error('Failed to apply audit change:', updateError);
        toast.error('应用修改失败');
        return false;
      }

      const { data: updatedRows, error: auditError } = await supabase
        .from('audit_records')
        .update({
          status: 'approved',
          reviewer_id: employee.id,
          review_time: new Date().toISOString(),
        })
        .eq('id', recordId)
        .eq('status', 'pending')
        .select('id');

      if (auditError) {
        console.error('Failed to update audit record:', auditError);
        toast.error('更新审核状态失败');
        return false;
      }

      if (!updatedRows || updatedRows.length === 0) {
        toast.error('该记录已被他人处理，请刷新后重试');
        await queryClient.invalidateQueries({ queryKey: ['audit-records'] });
        return false;
      }

      logOperation(
        'audit_center', 'audit', recordId,
        { status: 'pending' },
        { status: 'approved', ...newData },
        `审核通过: ${TABLE_TO_MODULE[targetTable] || targetTable}`
      );

      window.dispatchEvent(new CustomEvent(`${targetTable}-updated`));
      await queryClient.invalidateQueries({ queryKey: ['audit-records'] });
      toast.success('审核通过，修改已生效');
      return true;
    } catch (err) {
      console.error('Error approving record:', err);
      toast.error('处理失败');
      return false;
    }
  }, [employee, queryClient]);

  const rejectRecord = useCallback(async (recordId: string, reason: string): Promise<boolean> => {
    if (!employee) return false;

    try {
      const { data: updatedRows, error } = await supabase
        .from('audit_records')
        .update({
          status: 'rejected',
          reviewer_id: employee.id,
          review_time: new Date().toISOString(),
          review_comment: reason,
        })
        .eq('id', recordId)
        .eq('status', 'pending')
        .select('id');

      if (error) {
        console.error('Failed to reject audit record:', error);
        toast.error('拒绝审核失败');
        return false;
      }

      if (!updatedRows || updatedRows.length === 0) {
        toast.error('该记录已被他人处理，请刷新后重试');
        await queryClient.invalidateQueries({ queryKey: ['audit-records'] });
        return false;
      }

      logOperation('audit_center', 'reject', recordId, { status: 'pending' }, { status: 'rejected', reason }, `审核拒绝`);
      await queryClient.invalidateQueries({ queryKey: ['audit-records'] });
      toast.success('已拒绝');
      return true;
    } catch (err) {
      console.error('Error rejecting record:', err);
      toast.error('处理失败');
      return false;
    }
  }, [employee, queryClient]);

  return {
    records,
    legacyItems,
    totalCount,
    pendingCount,
    loading,
    refetch: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-records'] });
      queryClient.invalidateQueries({ queryKey: ['audit-pending-count'] });
    },
    approveRecord,
    rejectRecord,
    isAdmin: employee?.role === 'admin',
  };
}
