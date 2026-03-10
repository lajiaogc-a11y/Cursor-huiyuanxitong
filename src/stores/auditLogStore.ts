// System Audit Log Store - Immutable operation logging
// 使用数据库 operation_logs 表作为唯一数据源

import { supabase } from '@/integrations/supabase/client';
import { getCurrentOperatorSync, OperatorInfo } from '@/services/operatorService';
export type OperationType = 'create' | 'update' | 'cancel' | 'restore' | 'delete' | 'audit' | 'reject' | 'status_change';

export type ModuleType = 
  | 'order_management' 
  | 'member_management' 
  | 'activity_gift' 
  | 'employee_management' 
  | 'merchant_settlement' 
  | 'merchant_management' 
  | 'system_settings' 
  | 'audit_center'
  | 'referral'
  | 'card_management'
  | 'vendor_management'
  | 'provider_management'
  | 'activity_type'
  | 'currency_settings'
  | 'customer_source'
  | 'knowledge_base'
  | 'points_redemption';

export const MODULE_NAMES: Record<ModuleType, { zh: string; en: string }> = {
  order_management: { zh: '订单管理', en: 'Order Management' },
  member_management: { zh: '会员管理', en: 'Member Management' },
  activity_gift: { zh: '活动赠送', en: 'Activity Gift' },
  employee_management: { zh: '员工管理', en: 'Employee Management' },
  merchant_settlement: { zh: '商家结算', en: 'Merchant Settlement' },
  merchant_management: { zh: '商家管理', en: 'Merchant Management' },
  system_settings: { zh: '系统设置', en: 'System Settings' },
  audit_center: { zh: '审核中心', en: 'Audit Center' },
  referral: { zh: '推荐管理', en: 'Referral Management' },
  card_management: { zh: '卡片管理', en: 'Card Management' },
  vendor_management: { zh: '卡商管理', en: 'Vendor Management' },
  provider_management: { zh: '代付商家', en: 'Payment Provider' },
  activity_type: { zh: '活动类型', en: 'Activity Type' },
  currency_settings: { zh: '币种设置', en: 'Currency Settings' },
  customer_source: { zh: '客户来源', en: 'Customer Source' },
  knowledge_base: { zh: '公司文档', en: 'Company Docs' },
  points_redemption: { zh: '积分兑换', en: 'Points Redemption' },
};

export const OPERATION_NAMES: Record<OperationType, { zh: string; en: string }> = {
  create: { zh: '新增', en: 'Create' },
  update: { zh: '修改', en: 'Update' },
  cancel: { zh: '取消', en: 'Cancel' },
  restore: { zh: '恢复', en: 'Restore' },
  delete: { zh: '删除', en: 'Delete' },
  audit: { zh: '审核通过', en: 'Approved' },
  reject: { zh: '审核拒绝', en: 'Rejected' },
  status_change: { zh: '状态变更', en: 'Status Change' },
};

// Helper functions for getting localized names
export function getModuleName(module: ModuleType, lang: 'zh' | 'en' = 'zh'): string {
  return MODULE_NAMES[module]?.[lang] || module;
}

export function getOperationName(operation: OperationType, lang: 'zh' | 'en' = 'zh'): string {
  return OPERATION_NAMES[operation]?.[lang] || operation;
}

export const RESTORABLE_MODULES: ModuleType[] = [
  'member_management',
  'employee_management',
  'system_settings',
  'order_management',
  'activity_gift',
  'card_management',
  'vendor_management',
  'provider_management',
  'activity_type',
  'currency_settings',
  'customer_source',
  'referral',
  'knowledge_base',
  'merchant_settlement',
];

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  operatorId: string | null;
  operatorAccount: string;
  operatorRole: string;
  module: ModuleType;
  objectId: string;
  objectDescription?: string;
  operationType: OperationType;
  beforeData: any;
  afterData: any;
  ipAddress: string;
  isRestored?: boolean;
  restoredBy?: string;
  restoredAt?: string;
}

// ============= 内存缓存 =============
let logsCache: AuditLogEntry[] = [];
let cacheInitialized = false;

// ============= 缓存初始化 =============
export async function initializeAuditLogCache(): Promise<void> {
  if (cacheInitialized) return;
  
  try {
    const { data, error } = await supabase
      .from('operation_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(1000);
    
    if (error) throw error;
    
    logsCache = (data || []).map(r => ({
      id: r.id,
      timestamp: r.timestamp || '',
      operatorId: r.operator_id,
      operatorAccount: r.operator_account,
      operatorRole: r.operator_role,
      module: r.module as ModuleType,
      objectId: r.object_id || '',
      objectDescription: r.object_description || undefined,
      operationType: r.operation_type as OperationType,
      beforeData: r.before_data,
      afterData: r.after_data,
      ipAddress: r.ip_address || 'local',
      isRestored: r.is_restored || false,
      restoredBy: r.restored_by || undefined,
      restoredAt: r.restored_at || undefined,
    }));
    
    cacheInitialized = true;
    console.log('[AuditLog] Cache initialized from database');
  } catch (error) {
    console.error('[AuditLog] Failed to initialize cache:', error);
  }
}

// ============= 刷新缓存（公开） =============
export async function refreshAuditLogCache(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('operation_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(1000);
    
    if (error) throw error;
    
    logsCache = (data || []).map(r => ({
      id: r.id,
      timestamp: r.timestamp || '',
      operatorId: r.operator_id,
      operatorAccount: r.operator_account,
      operatorRole: r.operator_role,
      module: r.module as ModuleType,
      objectId: r.object_id || '',
      objectDescription: r.object_description || undefined,
      operationType: r.operation_type as OperationType,
      beforeData: r.before_data,
      afterData: r.after_data,
      ipAddress: r.ip_address || 'local',
      isRestored: r.is_restored || false,
      restoredBy: r.restored_by || undefined,
      restoredAt: r.restored_at || undefined,
    }));
    
    cacheInitialized = true;
  } catch (error) {
    console.error('[AuditLog] Failed to refresh cache:', error);
  }
}

// ============= 服务端分页查询 =============
const PAGE_SIZE = 50;

export interface AuditLogsPageFilters {
  module?: string;
  operationType?: string;
  operatorAccount?: string;
  dateRange?: { start: Date | null; end: Date | null };
  restoreStatus?: string;
  searchTerm?: string;
}

export async function fetchAuditLogsPage(
  page: number,
  pageSize: number = PAGE_SIZE,
  filters?: AuditLogsPageFilters
): Promise<{ logs: AuditLogEntry[]; totalCount: number }> {
  try {
    let query = supabase
      .from('operation_logs')
      .select('*', { count: 'exact' })
      .order('timestamp', { ascending: false });

    if (filters) {
      if (filters.module && filters.module !== 'all') {
        query = query.eq('module', filters.module);
      }
      if (filters.operationType && filters.operationType !== 'all') {
        query = query.eq('operation_type', filters.operationType);
      }
      if (filters.operatorAccount && filters.operatorAccount !== 'all') {
        query = query.eq('operator_account', filters.operatorAccount);
      }
      if (filters.restoreStatus && filters.restoreStatus !== 'all') {
        query = query.eq('is_restored', filters.restoreStatus === 'restored');
      }
      if (filters.dateRange?.start) {
        query = query.gte('timestamp', filters.dateRange.start.toISOString());
      }
      if (filters.dateRange?.end) {
        const end = new Date(filters.dateRange.end);
        end.setHours(23, 59, 59, 999);
        query = query.lte('timestamp', end.toISOString());
      }
      if (filters.searchTerm?.trim()) {
        const term = `%${filters.searchTerm.trim()}%`;
        query = query.or(
          `operator_account.ilike.${term},object_id.ilike.${term},object_description.ilike.${term}`
        );
      }
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const { data, error, count } = await query.range(from, to);

    if (error) throw error;

    const logs: AuditLogEntry[] = (data || []).map(r => ({
      id: r.id,
      timestamp: r.timestamp || '',
      operatorId: r.operator_id,
      operatorAccount: r.operator_account,
      operatorRole: r.operator_role,
      module: r.module as ModuleType,
      objectId: r.object_id || '',
      objectDescription: r.object_description || undefined,
      operationType: r.operation_type as OperationType,
      beforeData: r.before_data,
      afterData: r.after_data,
      ipAddress: r.ip_address || 'local',
      isRestored: r.is_restored || false,
      restoredBy: r.restored_by || undefined,
      restoredAt: r.restored_at || undefined,
    }));

    return { logs, totalCount: count ?? 0 };
  } catch (error) {
    console.error('[AuditLog] Failed to fetch page:', error);
    return { logs: [], totalCount: 0 };
  }
}

// ============= 读取函数 =============

export function getAuditLogs(): AuditLogEntry[] {
  if (!cacheInitialized) {
    initializeAuditLogCache();
  }
  return logsCache;
}

export function getLogsByModule(module: ModuleType): AuditLogEntry[] {
  return getAuditLogs().filter(log => log.module === module);
}

export function getLogsByOperator(operatorAccount: string): AuditLogEntry[] {
  return getAuditLogs().filter(log => log.operatorAccount === operatorAccount);
}

export function getLogsByDateRange(startDate: Date, endDate: Date): AuditLogEntry[] {
  return getAuditLogs().filter(log => {
    const logDate = new Date(log.timestamp);
    return logDate >= startDate && logDate <= endDate;
  });
}

export function getLogById(id: string): AuditLogEntry | undefined {
  return getAuditLogs().find(log => log.id === id);
}

// ============= 写入函数 =============

export async function appendAuditLog(
  entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'ipAddress'>
): Promise<AuditLogEntry> {
  const operator = getCurrentOperator();
  
  try {
    const { data, error } = await supabase
      .from('operation_logs')
      .insert({
        operator_id: entry.operatorId || null,
        operator_account: entry.operatorAccount || operator.account,
        operator_role: entry.operatorRole || operator.role,
        module: entry.module,
        operation_type: entry.operationType,
        object_id: entry.objectId,
        object_description: entry.objectDescription || null,
        before_data: entry.beforeData,
        after_data: entry.afterData,
      })
      .select()
      .single();

    if (error) throw error;

    const newEntry: AuditLogEntry = {
      id: data.id,
      timestamp: data.timestamp || new Date().toISOString(),
      operatorId: data.operator_id,
      operatorAccount: data.operator_account,
      operatorRole: data.operator_role,
      module: data.module as ModuleType,
      objectId: data.object_id || entry.objectId,
      objectDescription: data.object_description || entry.objectDescription,
      operationType: data.operation_type as OperationType,
      beforeData: data.before_data,
      afterData: data.after_data,
      ipAddress: data.ip_address || 'local',
    };

    // 更新缓存
    logsCache.unshift(newEntry);
    
    return newEntry;
  } catch (error) {
    console.error('[AuditLog] Failed to append log:', error);
    
    // 降级：返回一个临时日志
    const fallbackEntry: AuditLogEntry = {
      id: `LOCAL_${Date.now()}`,
      timestamp: new Date().toISOString(),
      operatorId: entry.operatorId || null,
      operatorAccount: entry.operatorAccount || operator.account,
      operatorRole: entry.operatorRole || operator.role,
      module: entry.module,
      objectId: entry.objectId,
      objectDescription: entry.objectDescription,
      operationType: entry.operationType,
      beforeData: entry.beforeData,
      afterData: entry.afterData,
      ipAddress: 'local',
    };
    
    logsCache.unshift(fallbackEntry);
    return fallbackEntry;
  }
}

export function appendAuditLogSync(
  entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'ipAddress'>
): AuditLogEntry {
  const operator = getCurrentOperator();
  
  const newEntry: AuditLogEntry = {
    id: `LOG_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    timestamp: new Date().toISOString(),
    operatorId: entry.operatorId || null,
    operatorAccount: entry.operatorAccount || operator.account,
    operatorRole: entry.operatorRole || operator.role,
    module: entry.module,
    objectId: entry.objectId,
    objectDescription: entry.objectDescription,
    operationType: entry.operationType,
    beforeData: entry.beforeData,
    afterData: entry.afterData,
    ipAddress: 'local',
  };

  // 添加到缓存
  logsCache.unshift(newEntry);

  // 异步写入数据库
  supabase
    .from('operation_logs')
    .insert({
      operator_id: entry.operatorId || null,
      operator_account: newEntry.operatorAccount,
      operator_role: newEntry.operatorRole,
      module: entry.module,
      operation_type: entry.operationType,
      object_id: entry.objectId,
      object_description: entry.objectDescription || null,
      before_data: entry.beforeData,
      after_data: entry.afterData,
    })
    .then(({ error }) => {
      if (error) {
        console.error('[AuditLog] Failed to save log to database:', error);
      }
    });

  return newEntry;
}

// ============= 辅助函数 =============

export function getObjectDiff(before: any, after: any): { key: string; before: any; after: any }[] {
  const diffs: { key: string; before: any; after: any }[] = [];
  
  if (!before && !after) return diffs;
  if (!before) before = {};
  if (!after) after = {};
  
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);
  
  allKeys.forEach(key => {
    const beforeVal = before[key];
    const afterVal = after[key];
    const beforeStr = JSON.stringify(beforeVal);
    const afterStr = JSON.stringify(afterVal);
    
    if (beforeStr !== afterStr) {
      diffs.push({ key, before: beforeVal, after: afterVal });
    }
  });
  
  return diffs;
}

export function isRestorableModule(module: ModuleType): boolean {
  return RESTORABLE_MODULES.includes(module);
}

export async function markLogAsRestored(logId: string, restoredById?: string): Promise<void> {
  try {
    await supabase
      .from('operation_logs')
      .update({ 
        is_restored: true,
        restored_by: restoredById || null,
        restored_at: new Date().toISOString(),
      })
      .eq('id', logId);
    
    const log = logsCache.find(l => l.id === logId);
    if (log) {
      log.isRestored = true;
    }
  } catch (error) {
    console.error('[AuditLog] Failed to mark log as restored:', error);
  }
}

export function getCurrentOperator(): OperatorInfo {
  return getCurrentOperatorSync();
}

export function logOperation(
  module: ModuleType,
  operationType: OperationType,
  objectId: string,
  beforeData: any,
  afterData: any,
  objectDescription?: string
): AuditLogEntry {
  const operator = getCurrentOperator();
  
  return appendAuditLogSync({
    operatorId: operator.id || null,
    operatorAccount: operator.account,
    operatorRole: operator.role,
    module,
    objectId,
    objectDescription,
    operationType,
    beforeData,
    afterData,
  });
}
