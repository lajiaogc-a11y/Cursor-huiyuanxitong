// ============= Audit Workflow Hook =============
// 审核工作流 - 审核设置优先：字段在审核设置中被勾选时，非管理员的修改一律进入待审核队列；
// 未勾选的字段依据 role_permissions 的 can_edit 决定是否允许直接编辑。

import { useCallback, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { createAuditRecord, getRolePermissionCanEditRow } from '@/services/data/tableQueryService';
import { loadSharedData } from '@/services/finance/sharedDataService';
import { useLanguage } from '@/contexts/LanguageContext';

import {
  type AuditSettings,
  DEFAULT_AUDIT_SETTINGS,
  mergeAuditSettings,
} from '@/lib/auditSettingsTypes';

export type { AuditSettings };

// workflow 字段 key（snake_case）→ 审核设置 key（camelCase）映射
// 用于将 useAuditWorkflow 中的 fieldKey 与 AuditCenter 审核设置中的勾选项对应
const WORKFLOW_TO_AUDIT_SETTING_KEY: Record<string, Record<string, string>> = {
    order: {
    phone_number: 'phone',
    card_value: 'cardValue',
    card_rate: 'cardRate',
    actual_paid: 'paidAmount',
    payment_value: 'paymentValue',
    foreign_rate: 'foreignCurrencyRate',
    usdt_rate: 'foreignCurrencyRate',
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
    source_id: 'sourceId',
    sourceId: 'sourceId',
    referrer: 'referrer',
    referrerPhone: 'referrer',
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

/**
 * 审核/保存流程里的 fieldKey（订单页、会员页等）→ role_permissions 表中的 field_name
 * 须与 dataFieldPermissionModules / useFieldPermissions 中 members、orders、activity 的键一致
 */
const WORKFLOW_TO_ROLE_PERMISSION_FIELD: Record<
  'order' | 'member' | 'activity',
  Record<string, string>
> = {
  order: {
    actual_paid: 'actual_payment',
    payment_value: 'actual_payment',
    foreign_rate: 'exchange_rate',
    usdt_rate: 'exchange_rate',
    demand_currency: 'currency',
  },
  member: {
    level: 'member_level',
    member_level: 'member_level',
    remark: 'remark',
    customerFeature: 'customer_feature',
    customer_feature: 'customer_feature',
    commonCards: 'common_cards',
    common_cards: 'common_cards',
    bankCard: 'bank_card',
    bank_card: 'bank_card',
    preferredCurrency: 'currency_preferences',
    currency_preferences: 'currency_preferences',
    sourceId: 'source',
    source_id: 'source',
    referrerPhone: 'referrer',
    referrer: 'referrer',
    points: 'points',
  },
  activity: {},
};

function resolveRolePermissionFieldName(
  module: 'order' | 'member' | 'activity',
  fieldKey: string
): string {
  const mapped = WORKFLOW_TO_ROLE_PERMISSION_FIELD[module]?.[fieldKey];
  if (mapped) return mapped;
  return fieldKey;
}

// 字段标签映射
const FIELD_LABELS: Record<string, Record<string, string>> = {
  order: {
    phone_number: '电话号码',
    card_value: '卡片面值',
    card_rate: '卡片汇率',
    actual_paid: '实付金额',
    payment_value: '代付价值',
    foreign_rate: '外币汇率',
    usdt_rate: 'USDT汇率',
    card_type: '卡片类型',
    vendor: '卡商',
    payment_provider: '代付商家',
    fee: '手续费',
    demand_currency: '需求币种',
    remark: '备注',
    sales_person: '业务员',
    cancel_button: '取消订单',
    delete_button: '删除订单',
  },
  member: {
    level: '会员等级',
    remark: '备注',
    customerFeature: '客户特点',
    commonCards: '常交易卡',
    bankCard: '银行卡',
    preferredCurrency: '币种偏好',
    sourceId: '来源',
    referrerPhone: '推荐人',
    points: '积分',
  },
  activity: {
    currency: '赠送币种',
    amount: '赠送金额',
    rate: '汇率',
    phone_number: '电话号码',
    payment_agent: '代付商家',
    gift_type: '类型',
    remark: '备注',
  },
};

const FIELD_LABELS_EN: Record<string, Record<string, string>> = {
  order: {
    phone_number: 'Phone Number',
    card_value: 'Card Value',
    card_rate: 'Card Rate',
    actual_paid: 'Actual Paid',
    payment_value: 'Payment Value',
    foreign_rate: 'Foreign Exchange Rate',
    usdt_rate: 'USDT Rate',
    card_type: 'Card Type',
    vendor: 'Vendor',
    payment_provider: 'Payment Provider',
    fee: 'Fee',
    demand_currency: 'Demand Currency',
    remark: 'Remark',
    sales_person: 'Sales Person',
    cancel_button: 'Cancel Order',
    delete_button: 'Delete Order',
  },
  member: {
    level: 'Member Level',
    remark: 'Remark',
    customerFeature: 'Customer Feature',
    commonCards: 'Common Cards',
    bankCard: 'Bank Card',
    preferredCurrency: 'Currency Preferences',
    sourceId: 'Source',
    referrerPhone: 'Referrer',
    points: 'Points',
  },
  activity: {
    currency: 'Gift Currency',
    amount: 'Gift Amount',
    rate: 'Exchange Rate',
    phone_number: 'Phone Number',
    payment_agent: 'Payment Provider',
    gift_type: 'Type',
    remark: 'Remark',
  },
};

function asPermissionBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === '1') return true;
  return false;
}

// 🔧 会话级权限缓存（性能优化）
const permissionCache = new Map<string, boolean>();
let cacheInvalidationRefCount = 0;
let cacheInvalidationTimer: ReturnType<typeof setInterval> | null = null;

// 清空权限缓存
function clearPermissionCache() {
  permissionCache.clear();
}

export function useAuditWorkflow() {
  const { employee } = useAuth();
  const { t } = useLanguage();
  
  // 订阅权限变更以清空缓存 - 引用计数保证只有一个 interval 运行
  useEffect(() => {
    cacheInvalidationRefCount++;
    if (cacheInvalidationRefCount === 1) {
      cacheInvalidationTimer = setInterval(() => {
        clearPermissionCache();
      }, 30000);
    }
    
    return () => {
      cacheInvalidationRefCount--;
      if (cacheInvalidationRefCount <= 0) {
        cacheInvalidationRefCount = 0;
        if (cacheInvalidationTimer) {
          clearInterval(cacheInvalidationTimer);
          cacheInvalidationTimer = null;
        }
      }
    };
  }, []);

  // 检查当前用户对特定模块和字段是否有编辑权限（直接编辑不需要审核）
  // 🔧 性能优化：使用缓存避免重复数据库查询
  const checkCanEditDirectly = useCallback(async (
    module: 'order' | 'member' | 'activity',
    fieldKey: string
  ): Promise<boolean> => {
    if (!employee) return false;
    
    // 管理员 / 租户总管理员：直接编辑
    if (employee.role === 'admin' || employee.is_super_admin) return true;
    
    const moduleName = MODULE_NAME_MAP[module] || module;
    const permissionField = resolveRolePermissionFieldName(module, fieldKey);
    const cacheKey = `${employee.role}:${moduleName}:${permissionField}`;
    
    // 先检查缓存
    if (permissionCache.has(cacheKey)) {
      return permissionCache.get(cacheKey)!;
    }
    
    const row = await getRolePermissionCanEditRow(employee.role, moduleName, permissionField);

    let canEdit = false;
    if (row && row.can_edit !== undefined && row.can_edit !== null) {
      canEdit = asPermissionBool(row.can_edit);
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
    const raw = await loadSharedData<AuditSettings>('auditSettings');
    const settings = mergeAuditSettings(raw);
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

  // 审核优先：字段在审核设置中被勾选时，非管理员一律需要审核
  const checkNeedsApproval = useCallback(async (
    module: 'order' | 'member' | 'activity',
    fieldKey: string
  ): Promise<boolean> => {
    const inAuditSettings = await checkFieldInAuditSettings(module, fieldKey);
    return inAuditSettings;
  }, [checkFieldInAuditSettings]);

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
      return { submitted: false, message: t('用户未登录', 'User not logged in') };
    }

    const inAuditSettings = await checkFieldInAuditSettings(params.module, params.fieldKey);
    if (!inAuditSettings) {
      return { submitted: false, message: t('此字段未开放审核', 'This field is not open for review') };
    }

    const fieldLabel = FIELD_LABELS[params.module]?.[params.fieldKey] || params.fieldKey;
    const fieldLabelEn = FIELD_LABELS_EN[params.module]?.[params.fieldKey] || params.fieldKey;
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

    try {
      await createAuditRecord(auditData);
    } catch (err) {
      console.error('Failed to submit for approval:', err);
      return { submitted: false, message: t('提交审核失败', 'Failed to submit for review') };
    }

    return { 
      submitted: true, 
      message: t(`修改 "${fieldLabel}" 已提交审核，等待管理员审批`, `Change to "${fieldLabelEn}" submitted for review, awaiting admin approval`) 
    };
  }, [employee, checkFieldInAuditSettings, t]);

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
      return { submitted: false, pendingFields: [], directFields: [], rejectedFields: [], message: t('用户未登录', 'User not logged in') };
    }

    const pendingFields: string[] = [];
    const directFields: string[] = [];
    const rejectedFields: string[] = [];
    
    // 第一轮：预分类所有字段，不写 audit_records
    const classified: { change: typeof params.changes[0]; category: 'pending' | 'direct' | 'rejected' }[] = [];
    for (const change of params.changes) {
      const inAuditSettings = await checkFieldInAuditSettings(params.module, change.fieldKey);
      if (inAuditSettings) {
        pendingFields.push(change.fieldKey);
        classified.push({ change, category: 'pending' });
      } else {
        const canEditDirectly = await checkCanEditDirectly(params.module, change.fieldKey);
        if (canEditDirectly) {
          directFields.push(change.fieldKey);
          classified.push({ change, category: 'direct' });
        } else {
          rejectedFields.push(change.fieldKey);
          classified.push({ change, category: 'rejected' });
        }
      }
    }

    // 有被拒字段时，立即终止，不写任何 audit_records
    if (rejectedFields.length > 0) {
      const fieldLabels = rejectedFields.map(f => FIELD_LABELS[params.module]?.[f] || f);
      const fieldLabelsEn = rejectedFields.map(f => FIELD_LABELS_EN[params.module]?.[f] || f);
      return {
        submitted: false,
        pendingFields,
        directFields,
        rejectedFields,
        hasRejected: true,
        message: t(
          `以下字段不可编辑且未开放审核: ${fieldLabels.join(', ')}`,
          `The following fields cannot be edited and are not open for review: ${fieldLabelsEn.join(', ')}`
        ),
      };
    }

    // 第二轮：确认无拒绝后，提交需要审核的字段到 audit_records
    for (const item of classified) {
      if (item.category === 'pending') {
        await submitForApproval({
          module: params.module,
          fieldKey: item.change.fieldKey,
          oldValue: item.change.oldValue,
          newValue: item.change.newValue,
          targetId: params.targetId,
          targetDescription: params.targetDescription,
          originalData: params.originalData,
        });
      }
    }

    if (pendingFields.length > 0) {
      const fieldLabels = pendingFields.map(f => FIELD_LABELS[params.module]?.[f] || f);
      const fieldLabelsEn = pendingFields.map(f => FIELD_LABELS_EN[params.module]?.[f] || f);
      return {
        submitted: true,
        pendingFields,
        directFields,
        rejectedFields: [],
        message: t(
          `以下字段需要审核: ${fieldLabels.join(', ')}`,
          `The following fields require review: ${fieldLabelsEn.join(', ')}`
        ),
      };
    }

    return {
      submitted: false,
      pendingFields: [],
      directFields: params.changes.map(c => c.fieldKey),
      rejectedFields: [],
      hasRejected: false,
      message: t('所有修改已直接生效', 'All changes applied directly'),
    };
  }, [employee, checkCanEditDirectly, checkFieldInAuditSettings, submitForApproval, t]);

  return {
    checkNeedsApproval,
    checkCanEditDirectly,
    submitForApproval,
    submitBatchForApproval,
    isAdmin: employee?.role === 'admin',
    isManager: employee?.role === 'manager' || employee?.role === 'admin',
    currentEmployee: employee,
  };
}

