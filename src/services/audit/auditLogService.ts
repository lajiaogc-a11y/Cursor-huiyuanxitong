// System Audit Log Store - Immutable operation logging
// 使用数据库 operation_logs 表作为唯一数据源

import { apiGet, apiPost } from '@/api/client';
import { getCurrentOperatorSync, OperatorInfo } from '@/services/members/operatorService';
import { postOperationLog } from '@/services/staff/dataApi';
import { notify } from "@/lib/notifyHub";
import {
  parseOperationLogDataField,
  INVALID_OPERATION_LOG_JSON,
  OPERATION_LOG_RAW_PREVIEW,
} from '@/lib/operationLogPayload';
import { repairUtf8MisdecodedAsLatin1 } from '@/lib/utf8MojibakeRepair';
import { pickBilingual } from '@/lib/appLocale';
export type OperationType =
  | 'create' | 'update' | 'cancel' | 'restore' | 'delete'
  | 'audit' | 'reject'
  | 'status_change' | 'force_logout'
  | 'batch_delete'
  | 'mysql_mysqldump'
  | 'knowledge_category_patch_delegated'
  | 'shared_data_upsert_delegated';

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
  force_logout: { zh: '强制登出', en: 'Force Logout' },
  batch_delete: { zh: '批量删除', en: 'Batch Delete' },
  mysql_mysqldump: { zh: '数据库备份', en: 'Database Backup' },
  knowledge_category_patch_delegated: { zh: '文档分类更新(委托)', en: 'Docs Category Update (Delegated)' },
  shared_data_upsert_delegated: { zh: '共享数据更新(委托)', en: 'Shared Data Update (Delegated)' },
};

// Helper functions for getting localized names
export function getModuleName(module: ModuleType, lang: 'zh' | 'en' = 'zh'): string {
  const key = repairUtf8MisdecodedAsLatin1(String(module)) as ModuleType;
  return MODULE_NAMES[key]?.[lang] || MODULE_NAMES[module]?.[lang] || key;
}

/** UTF-8/Latin-1 修复后转小写，供 OPERATION_NAMES、徽章颜色等统一键值 */
export function normalizeOperationTypeKey(operation: OperationType | string): string {
  return repairUtf8MisdecodedAsLatin1(String(operation ?? '')).trim().toLowerCase();
}

export function getOperationName(operation: OperationType | string, lang: 'zh' | 'en' = 'zh'): string {
  const repaired = repairUtf8MisdecodedAsLatin1(String(operation ?? '')).trim();
  const keyLower = normalizeOperationTypeKey(operation) as OperationType;
  return (
    OPERATION_NAMES[keyLower]?.[lang] ||
    OPERATION_NAMES[repaired as OperationType]?.[lang] ||
    repaired
  );
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

function mapOperationLogRows(data: unknown): AuditLogEntry[] {
  const rows = Array.isArray(data) ? data : [];
  return rows.map((r: Record<string, any>) => ({
    id: r.id,
    timestamp: r.timestamp || '',
    operatorId: r.operator_id,
    operatorAccount: repairUtf8MisdecodedAsLatin1(String(r.operator_account ?? '')),
    operatorRole: repairUtf8MisdecodedAsLatin1(String(r.operator_role ?? '')),
    module: repairUtf8MisdecodedAsLatin1(String(r.module ?? '')) as ModuleType,
    objectId: r.object_id || '',
    objectDescription: r.object_description
      ? repairUtf8MisdecodedAsLatin1(String(r.object_description))
      : undefined,
    operationType: repairUtf8MisdecodedAsLatin1(String(r.operation_type ?? '')) as OperationType,
    beforeData: parseOperationLogDataField(r.before_data) ?? r.before_data,
    afterData: parseOperationLogDataField(r.after_data) ?? r.after_data,
    ipAddress: r.ip_address || 'local',
    isRestored: r.is_restored || false,
    restoredBy: r.restored_by || undefined,
    restoredAt: r.restored_at || undefined,
  }));
}

// ============= 缓存初始化 =============
export async function initializeAuditLogCache(): Promise<void> {
  if (cacheInitialized) return;
  
  try {
    const data = await apiGet<unknown>(
      `/api/data/table/operation_logs?select=*&order=timestamp.desc&limit=1000`
    );
    logsCache = mapOperationLogRows(data);
    cacheInitialized = true;
    console.log('[AuditLog] Cache initialized from database');
  } catch (error) {
    console.error('[AuditLog] Failed to initialize cache:', error);
  }
}

// ============= 刷新缓存（公开） =============
export async function refreshAuditLogCache(): Promise<void> {
  try {
    const data = await apiGet<unknown>(
      `/api/data/table/operation_logs?select=*&order=timestamp.desc&limit=1000`
    );
    logsCache = mapOperationLogRows(data);
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
  tenantId?: string | null;
}

export async function fetchAuditLogsPage(
  page: number,
  pageSize: number = PAGE_SIZE,
  filters?: AuditLogsPageFilters,
  isExport = false,
): Promise<{ logs: AuditLogEntry[]; totalCount: number; distinctOperators: string[]; moduleCounts: Record<string, number> }> {
  try {
    // 优先使用专用日志 API（完整鉴权与租户过滤）
    try {
      const { getOperationLogsApi } = await import('@/services/data/dataApiService');
      const result = await getOperationLogsApi({
        page,
        pageSize,
        module: filters?.module,
        operationType: filters?.operationType,
        operatorAccount: filters?.operatorAccount,
        restoreStatus: filters?.restoreStatus,
        searchTerm: filters?.searchTerm,
        tenantId: filters?.tenantId,
        dateStart: filters?.dateRange?.start?.toISOString(),
        dateEnd: filters?.dateRange?.end
          ? (() => {
              const end = new Date(filters!.dateRange!.end!);
              end.setHours(23, 59, 59, 999);
              return end.toISOString();
            })()
          : undefined,
        export: isExport,
      });
      const rawLogs = result.logs || [];
      const logs: AuditLogEntry[] = rawLogs.map((r: Record<string, unknown>) => {
        const row = r as Record<string, unknown>;
        return {
          id: (row.id as string) || '',
          timestamp: (row.timestamp as string) || '',
          operatorId: (row.operatorId ?? row.operator_id) as string | null,
          operatorAccount: repairUtf8MisdecodedAsLatin1(
            String((row.operatorAccount ?? row.operator_account) || ''),
          ),
          operatorRole: repairUtf8MisdecodedAsLatin1(
            String((row.operatorRole ?? row.operator_role) || ''),
          ),
          module: (row.module as ModuleType) || 'order_management',
          objectId: (row.objectId ?? row.object_id) as string || '',
          objectDescription: (() => {
            const od = (row.objectDescription ?? row.object_description) as string | undefined;
            return od ? repairUtf8MisdecodedAsLatin1(od) : undefined;
          })(),
          operationType: (row.operationType ?? row.operation_type) as OperationType || 'update',
          beforeData: parseOperationLogDataField(row.beforeData ?? row.before_data) ?? (row.beforeData ?? row.before_data),
          afterData: parseOperationLogDataField(row.afterData ?? row.after_data) ?? (row.afterData ?? row.after_data),
          ipAddress: (row.ipAddress ?? row.ip_address) as string || 'local',
          isRestored: !!(row.isRestored ?? row.is_restored ?? false),
          restoredBy: (row.restoredBy ?? row.restored_by) as string | undefined,
          restoredAt: (row.restoredAt ?? row.restored_at) as string | undefined,
        };
      });
      return {
        logs,
        totalCount: result.totalCount ?? 0,
        distinctOperators: result.distinctOperators ?? [],
        moduleCounts: result.moduleCounts ?? {},
      };
    } catch (apiErr) {
      console.warn('[AuditLog] API fetch failed:', apiErr);
      if (typeof window !== 'undefined') {
        notify.error(pickBilingual('操作日志加载失败，请确保后端服务已启动（cd server && npm run dev）', 'Failed to load audit logs. Please ensure the backend is running (cd server && npm run dev)'));
      }
      throw apiErr;
    }
  } catch (error) {
    console.error('[AuditLog] Failed to fetch page:', error);
    throw error;
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
    await postOperationLog({
      operatorId: entry.operatorId || null,
      operatorAccount: entry.operatorAccount || operator.account,
      operatorRole: entry.operatorRole || operator.role,
      module: entry.module,
      operationType: entry.operationType,
      objectId: entry.objectId,
      objectDescription: entry.objectDescription || null,
      beforeData: entry.beforeData,
      afterData: entry.afterData,
    });

    const newEntry: AuditLogEntry = {
      id: `LOG_${Date.now()}`,
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

  // 异步写入数据库（通过后端 API 绕过 RLS）
  void postOperationLog({
    operatorId: entry.operatorId || null,
    operatorAccount: newEntry.operatorAccount,
    operatorRole: newEntry.operatorRole,
    module: entry.module,
    operationType: entry.operationType,
    objectId: entry.objectId,
    objectDescription: entry.objectDescription || null,
    beforeData: entry.beforeData,
    afterData: entry.afterData,
  }).catch((err) => console.error('[AuditLog] Failed to save log:', err));

  return newEntry;
}

// ============= 辅助函数 =============

export function getObjectDiff(before: any, after: any): { key: string; before: any; after: any }[] {
  const diffs: { key: string; before: any; after: any }[] = [];

  const b = parseOperationLogDataField(before);
  const a = parseOperationLogDataField(after);

  if (b?.[INVALID_OPERATION_LOG_JSON] || a?.[INVALID_OPERATION_LOG_JSON]) {
    return [];
  }

  const bb = b || {};
  const aa = a || {};

  const allKeys = new Set([...Object.keys(bb), ...Object.keys(aa)]);

  allKeys.forEach((key) => {
    if (key === INVALID_OPERATION_LOG_JSON || key === OPERATION_LOG_RAW_PREVIEW) return;

    const beforeVal = bb[key];
    const afterVal = aa[key];
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

/** 与列表 tenant 筛选一致：平台超管代管某租户时传入 tenantId；未选租户时不传。 */
export async function markLogAsRestored(
  logId: string,
  restoredById?: string,
  tenantId?: string | null,
): Promise<boolean> {
  try {
    const params = new URLSearchParams();
    if (tenantId) params.set('tenant_id', tenantId);
    const q = params.toString();
    await apiPost(
      `/api/data/operation-logs/${encodeURIComponent(logId)}/mark-restored${q ? `?${q}` : ''}`,
      {},
    );

    const log = logsCache.find(l => l.id === logId);
    if (log) {
      log.isRestored = true;
    }
    return true;
  } catch (error) {
    console.error('[AuditLog] Failed to mark log as restored:', error);
    return false;
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
