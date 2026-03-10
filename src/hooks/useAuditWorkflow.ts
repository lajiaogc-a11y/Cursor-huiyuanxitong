// ============= Audit Workflow Hook =============
// 审核工作流 - 根据 role_permissions 表检查权限，并结合审核设置（auditSettings）决定是否提交审核
// 方案 A：只有「权限不允许直接编辑」且「字段在审核设置中被勾选」时，才写入 audit_records

import { useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { loadSharedData } from '@/services/sharedDataService';

// 审核设置类型（与 AuditCenter 一致）
export interface AuditSettings {
  orderFields: string[];
  memberFields: string[];
  activityFields: string[];
  orderOperations?: string[];
}

const DEFAULT_AUDIT_SETTINGS: AuditSettings = {
  orderFields: [],
  memberFields: [],
  activityFields: [],
  orderOperations: [],
};

// workflow 字段 key（snake_case）→ 审核设置 key（camelCase）映射
// 用于将 useAuditWorkflow 中的 fieldKey 与 AuditCenter 审核设置中的勾选项对应
const WORKFLOW_TO_AUDIT_SETTING_KEY: Record<string, Record<string, string>> = {
    order: {
    phone_number: 'phone',
    member_code: 'memberCode',
    card_value: 'cardValue',
    actual_payment: 'paidAmount',
    exchange_rate: 'foreignCurrencyRate',
    foreign_rate: 'foreignCurrencyRate',
    card_type: 'cardType',
    order_type: 'cardType',
    vendor: 'vendor',
    vendor_id: 'vendor',
    card_merchant_id: 'vendor',
    payment_provider: 'paymentProvider',
    payment_provider_id: 'paymentProvider',
    fee: 'fee',
    currency: 'currency',
    demand_currency: 'currency',
    remark: 'remark',
    sales_person: 'salesPerson',
    sales_user_id: 'salesPerson',
    cancel_button: 'cancelOrder',
    delete_button: 'deleteOrder',
  },
  member: {
    phone_number: 'phone',
    member_code: 'memberCode',
    member_level: 'level',
    level: 'level',
    remark: 'remark',
    points: 'balance',
    common_cards: 'commonCards',
    commonCards: 'commonCards',
    currency_preferences: 'currencyPreferences',
    preferredCurrency: 'currencyPreferences',
    bank_card: 'bankCard',
    bankCard: 'bankCard',
    customer_feature: 'customerFeature',
    customerFeature: 'customerFeature',
    source: 'source',
    source_id: 'sourceId',
    sourceId: 'sourceId',
    referrer: 'referrer',
    recorder: 'recorder',
    recorder_id: 'recorder',
    delete_button: 'deleteButton',
  },
  activity: {
    currency: 'currency',
    amount: 'amount',
    rate: 'rate',
    phone_number: 'phone',
    payment_agent: 'paymentAgent',
    gift_type: 'giftType',
    remark: 'remark',
    delete_button: 'deleteButton',
  },
};

export interface AuditItem {
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

// 模块名映射
const MODULE_NAME_MAP: Record<string, string> = {
  order: 'orders',
  member: 'members',
  activity: 'activity',
};

// 字段标签映射
const FIELD_LABELS: Record<string, Record<string, string>> = {
  order: {
    phone_number: '电话号码',
    member_code: '会员编号',
    card_value: '卡片价值',
    actual_payment: '实付金额',
    exchange_rate: '外币汇率',
    card_type: '卡片类型',
    vendor: '卡商',
    payment_provider: '代付商家',
    fee: '手续费',
    currency: '币种',
    remark: '备注',
    sales_person: '业务员',
    cancel_button: '取消按钮',
    delete_button: '删除按钮',
  },
  member: {
    phone_number: '电话号码',
    member_code: '会员编号',
    member_level: '会员等级',
    remark: '备注',
    common_cards: '常交易卡',
    currency_preferences: '币种偏好',
    bank_card: '银行卡',
    customer_feature: '客户特点',
    source: '客户来源',
    referrer: '推荐人',
    recorder: '记录人',
    points: '积分',
    delete_button: '删除按钮',
  },
  activity: {
    currency: '币种',
    amount: '金额',
    rate: '汇率',
    phone_number: '电话号码',
    payment_agent: '代付商家',
    gift_type: '类型',
    remark: '备注',
    delete_button: '删除按钮',
  },
};

// 🔧 会话级权限缓存（性能优化）
const permissionCache = new Map<string, boolean>();
let cacheInvalidationSubscribed = false;

// 清空权限缓存
function clearPermissionCache() {
  permissionCache.clear();
}

export function useAuditWorkflow() {
  const { employee } = useAuth();
  
  // 订阅权限变更以清空缓存
  useEffect(() => {
    if (cacheInvalidationSubscribed) return;
    cacheInvalidationSubscribed = true;
    
    const channel = supabase
      .channel('permission-cache-invalidation')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'role_permissions' }, () => {
        clearPermissionCache();
      })
      .subscribe();
    
    return () => {
      // 注意：不在这里取消订阅，因为这是全局缓存
    };
  }, []);

  // 检查当前用户对特定模块和字段是否有编辑权限（直接编辑不需要审核）
  // 🔧 性能优化：使用缓存避免重复数据库查询
  const checkCanEditDirectly = useCallback(async (
    module: 'order' | 'member' | 'activity',
    fieldKey: string
  ): Promise<boolean> => {
    if (!employee) return false;
    
    // 管理员直接编辑
    if (employee.role === 'admin') return true;
    
    const moduleName = MODULE_NAME_MAP[module] || module;
    const cacheKey = `${employee.role}:${moduleName}:${fieldKey}`;
    
    // 先检查缓存
    if (permissionCache.has(cacheKey)) {
      return permissionCache.get(cacheKey)!;
    }
    
    // 从 role_permissions 表查询权限
    const { data } = await supabase
      .from('role_permissions')
      .select('can_edit')
      .eq('role', employee.role)
      .eq('module_name', moduleName)
      .eq('field_name', fieldKey)
      .single();
    
    let canEdit = false;
    if (data) {
      canEdit = data.can_edit;
    } else {
      // 默认：主管可编辑，员工不可直接编辑（需审核）
      canEdit = employee.role === 'manager';
    }
    
    // 缓存结果
    permissionCache.set(cacheKey, canEdit);
    return canEdit;
  }, [employee]);

  // 检查字段是否在审核设置白名单中（审核中心勾选的字段才允许进入审核流程）
  const checkFieldInAuditSettings = useCallback(async (
    module: 'order' | 'member' | 'activity',
    fieldKey: string
  ): Promise<boolean> => {
    const settings = await loadSharedData<AuditSettings>('auditSettings') || DEFAULT_AUDIT_SETTINGS;
    const mapping = WORKFLOW_TO_AUDIT_SETTING_KEY[module];
    const auditSettingKey = mapping?.[fieldKey];
    if (!auditSettingKey) return false;

    if (fieldKey === 'cancel_button' || fieldKey === 'delete_button') {
      return Array.isArray(settings.orderOperations) && settings.orderOperations.includes(auditSettingKey);
    }
    const fieldArray = module === 'order' ? settings.orderFields
      : module === 'member' ? settings.memberFields
      : settings.activityFields;
    return Array.isArray(fieldArray) && fieldArray.includes(auditSettingKey);
  }, []);

  // 检查当前用户是否需要审核
  // 方案 A：只有「权限不允许直接编辑」且「字段在审核设置中被勾选」时，才需要审核
  const checkNeedsApproval = useCallback(async (
    module: 'order' | 'member' | 'activity',
    fieldKey: string
  ): Promise<boolean> => {
    const canEditDirectly = await checkCanEditDirectly(module, fieldKey);
    if (canEditDirectly) return false;

    const inAuditSettings = await checkFieldInAuditSettings(module, fieldKey);
    return inAuditSettings;
  }, [checkCanEditDirectly, checkFieldInAuditSettings]);

  // 提交审核请求到 audit_records 表
  const submitForApproval = useCallback(async (params: {
    module: 'order' | 'member' | 'activity';
    fieldKey: string;
    oldValue: any;
    newValue: any;
    targetId: string;
    targetDescription?: string;
    originalData?: any;
  }): Promise<{ submitted: boolean; message: string }> => {
    if (!employee) {
      return { submitted: false, message: '用户未登录' };
    }

    const canEditDirectly = await checkCanEditDirectly(params.module, params.fieldKey);
    if (canEditDirectly) {
      return { submitted: false, message: '无需审核，可直接编辑' };
    }

    const inAuditSettings = await checkFieldInAuditSettings(params.module, params.fieldKey);
    if (!inAuditSettings) {
      return { submitted: false, message: '此字段不可编辑且未开放审核' };
    }

    const fieldLabel = FIELD_LABELS[params.module]?.[params.fieldKey] || params.fieldKey;
    const moduleName = MODULE_NAME_MAP[params.module] || params.module;
    
    // 构建审核数据
    const auditData = {
      target_table: moduleName,
      target_id: params.targetId,
      action_type: 'update',
      old_data: { [params.fieldKey]: params.oldValue },
      new_data: { [params.fieldKey]: params.newValue },
      submitter_id: employee.id,
      status: 'pending',
    };

    const { error } = await supabase
      .from('audit_records')
      .insert(auditData);

    if (error) {
      console.error('Failed to submit for approval:', error);
      return { submitted: false, message: '提交审核失败' };
    }

    return { 
      submitted: true, 
      message: `修改 "${fieldLabel}" 已提交审核，等待管理员审批` 
    };
  }, [employee, checkCanEditDirectly, checkFieldInAuditSettings]);

  // 批量提交审核（多个字段变更）
  const submitBatchForApproval = useCallback(async (params: {
    module: 'order' | 'member' | 'activity';
    changes: { fieldKey: string; oldValue: any; newValue: any }[];
    targetId: string;
    targetDescription?: string;
    originalData?: any;
  }): Promise<{ 
    submitted: boolean; 
    pendingFields: string[];
    directFields: string[];
    rejectedFields: string[];
    hasRejected?: boolean;
    message: string 
  }> => {
    if (!employee) {
      return { submitted: false, pendingFields: [], directFields: [], rejectedFields: [], message: '用户未登录' };
    }

    const pendingFields: string[] = [];
    const directFields: string[] = [];
    const rejectedFields: string[] = [];
    
    for (const change of params.changes) {
      const canEditDirectly = await checkCanEditDirectly(params.module, change.fieldKey);
      const inAuditSettings = await checkFieldInAuditSettings(params.module, change.fieldKey);
      
      if (canEditDirectly) {
        directFields.push(change.fieldKey);
      } else if (inAuditSettings) {
        pendingFields.push(change.fieldKey);
        await submitForApproval({
          module: params.module,
          fieldKey: change.fieldKey,
          oldValue: change.oldValue,
          newValue: change.newValue,
          targetId: params.targetId,
          targetDescription: params.targetDescription,
          originalData: params.originalData,
        });
      } else {
        rejectedFields.push(change.fieldKey);
      }
    }

    if (rejectedFields.length > 0) {
      const fieldLabels = rejectedFields.map(f => FIELD_LABELS[params.module]?.[f] || f);
      return {
        submitted: false,
        pendingFields,
        directFields,
        rejectedFields,
        hasRejected: true,
        message: `以下字段不可编辑且未开放审核: ${fieldLabels.join(', ')}`,
      };
    }

    if (pendingFields.length > 0) {
      const fieldLabels = pendingFields.map(f => FIELD_LABELS[params.module]?.[f] || f);
      return {
        submitted: true,
        pendingFields,
        directFields,
        rejectedFields: [],
        message: `以下字段需要审核: ${fieldLabels.join(', ')}`,
      };
    }

    return {
      submitted: false,
      pendingFields: [],
      directFields: params.changes.map(c => c.fieldKey),
      rejectedFields: [],
      hasRejected: false,
      message: '所有修改已直接生效',
    };
  }, [employee, checkCanEditDirectly, checkFieldInAuditSettings, submitForApproval]);

  // 审核通过
  const approveAuditItem = useCallback(async (itemId: string): Promise<boolean> => {
    if (!employee || employee.role !== 'admin') {
      toast.error('权限不足');
      return false;
    }

    const { error } = await supabase
      .from('audit_records')
      .update({
        status: 'approved',
        reviewer_id: employee.id,
        review_time: new Date().toISOString(),
      })
      .eq('id', itemId);

    if (error) {
      console.error('Failed to approve audit item:', error);
      toast.error('审核通过失败');
      return false;
    }
    
    return true;
  }, [employee]);

  // 审核拒绝
  const rejectAuditItem = useCallback(async (itemId: string, reason: string): Promise<boolean> => {
    if (!employee || employee.role !== 'admin') {
      toast.error('权限不足');
      return false;
    }

    const { error } = await supabase
      .from('audit_records')
      .update({
        status: 'rejected',
        reviewer_id: employee.id,
        review_time: new Date().toISOString(),
        review_comment: reason,
      })
      .eq('id', itemId);

    if (error) {
      console.error('Failed to reject audit item:', error);
      toast.error('审核拒绝失败');
      return false;
    }
    
    return true;
  }, [employee]);

  return {
    checkNeedsApproval,
    checkCanEditDirectly,
    submitForApproval,
    submitBatchForApproval,
    approveAuditItem,
    rejectAuditItem,
    isAdmin: employee?.role === 'admin',
    isManager: employee?.role === 'manager' || employee?.role === 'admin',
    currentEmployee: employee,
  };
}

// 格式化值为字符串
function formatValue(value: any): string {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// 导出工具函数供非 React 代码使用
export async function addAuditItemDirectly(params: {
  module: string;
  field: string;
  oldValue: any;
  newValue: any;
  targetId: string;
  operatorId: string;
  targetDescription?: string;
}): Promise<boolean> {
  const moduleMap: Record<string, string> = {
    '订单管理': 'orders',
    '会员管理': 'members',
    '活动赠送': 'activity',
  };
  
  const targetTable = moduleMap[params.module] || params.module;
  
  const { error } = await supabase
    .from('audit_records')
    .insert({
      target_table: targetTable,
      target_id: params.targetId,
      action_type: 'update',
      old_data: { [params.field]: params.oldValue },
      new_data: { [params.field]: params.newValue },
      submitter_id: params.operatorId,
      status: 'pending',
    });
  
  return !error;
}
