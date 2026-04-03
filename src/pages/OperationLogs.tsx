import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from "react-router-dom";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import {
  getMemberRow,
  createMemberRow,
  patchMemberRow,
  getEmployeeRow,
  createEmployeeRow,
  patchEmployeeRow,
  restoreOrderFromAudit,
  restoreActivityGiftFromAudit,
  restoreCardFromAudit,
  restoreVendorFromAudit,
  restorePaymentProviderFromAudit,
  restoreActivityTypeFromAudit,
  restoreCurrencyFromAudit,
  restoreCustomerSourceFromAudit,
  restoreReferralFromAudit,
} from "@/services/audit/operationLogRestoreService";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const ErrorReportsPanel = lazy(() => import("@/components/ErrorReportsPanel"));
import { safeNumber } from "@/lib/safeCalc";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StickyScrollTableContainer } from "@/components/ui/sticky-scroll-table";
import { TablePagination } from "@/components/ui/table-pagination";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RefreshCw, Search, Eye, RotateCcw, Shield, Lock, Loader2, Download, CheckSquare, AlertTriangle } from "lucide-react";
import { ModuleCoverageDashboard } from "@/components/ModuleCoverageDashboard";
import { Checkbox } from "@/components/ui/checkbox";
import { notify } from "@/lib/notifyHub";
import {
  fetchAuditLogsPage,
  AuditLogEntry,
  ModuleType,
  MODULE_NAMES,
  OPERATION_NAMES,
  OperationType,
  getObjectDiff,
  isRestorableModule,
  logOperation,
  markLogAsRestored,
  getModuleName,
  getOperationName,
  normalizeOperationTypeKey,
  refreshAuditLogCache,
} from "@/stores/auditLogStore";
import DateRangeFilter from "@/components/DateRangeFilter";
import {
  TimeRangeType,
  DateRange,
  getTimeRangeDates,
} from "@/lib/dateFilter";
import { translateFieldName, formatDisplayValue, formatLogFieldValue, getReadableObjectId, cleanDescription, HIDDEN_LOG_FIELDS, formatIpAddress } from "@/lib/fieldLabelMap";
import { summarizeOperationLogPayloadIssues } from "@/lib/operationLogPayload";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { exportToCSV, formatDateTimeForExport } from "@/lib/exportUtils";
import { ExportConfirmDialog } from "@/components/ExportConfirmDialog";
import { useExportConfirm } from "@/hooks/useExportConfirm";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobileCardActions, MobilePagination, MobileEmptyState } from "@/components/ui/mobile-data-card";
import { MobileFilterBar } from "@/components/ui/mobile-filter-bar";
import { notifyDataMutation } from "@/services/system/dataRefreshManager";
import { formatBeijingTime } from "@/lib/beijingTime";
import { saveSharedData, loadSharedData } from "@/services/finance/sharedDataService";
import { PageHeader, KPIGrid, ErrorState } from "@/components/common";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { AdminOperationLogsTab } from "@/pages/member-portal/AdminOperationLogsTab";

function operationLogsTabFromSearch(sp: URLSearchParams): "logs" | "errors" | "member" {
  const v = sp.get("tab");
  if (v === "errors" || v === "member") return v;
  return "logs";
}

// Legacy support
export interface OperationLog {
  id: string;
  timestamp: string;
  operator: string;
  module: string;
  action: string;
  details: string;
  ip?: string;
  oldData?: any;
  newData?: any;
  targetId?: string;
  targetType?: string;
}

// Legacy addOperationLog - 使用数据库版本
export const addOperationLog = async (log: Omit<OperationLog, 'id' | 'timestamp'>) => {
  const { logOperationToDb } = await import('@/hooks/useOperationLogs');
  return logOperationToDb(
    log.module,
    log.action,
    log.targetId || null,
    log.oldData,
    log.newData,
    log.details
  );
};

export default function OperationLogs() {
  const { employee, isAdmin: userIsAdmin } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => operationLogsTabFromSearch(searchParams));

  useEffect(() => {
    setActiveTab(operationLogsTabFromSearch(searchParams));
  }, [searchParams]);

  const handleOperationLogsTabChange = (value: string) => {
    const next = value === "errors" || value === "member" ? value : "logs";
    setActiveTab(next);
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (next === "logs") n.delete("tab");
        else n.set("tab", next);
        return n;
      },
      { replace: true },
    );
  };
  const useCompactLayout = isMobile || isTablet;
  const queryClient = useQueryClient();
  const exportConfirm = useExportConfirm();
  const effectiveTenantId = employee?.is_platform_super_admin
    ? (viewingTenantId || null)
    : (viewingTenantId || employee?.tenant_id || null);

  const [searchTerm, setSearchTerm] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [operationFilter, setOperationFilter] = useState<string>("all");
  const [operatorFilter, setOperatorFilter] = useState<string>("all");
  const [restoreStatusFilter, setRestoreStatusFilter] = useState<string>("all");
  const [viewingLog, setViewingLog] = useState<AuditLogEntry | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState<AuditLogEntry | null>(null);
  const [restorePreview, setRestorePreview] = useState<AuditLogEntry | null>(null);
  
  // 批量恢复状态
  const [selectedLogs, setSelectedLogs] = useState<Set<string>>(new Set());
  const [batchRestoreConfirm, setBatchRestoreConfirm] = useState(false);
  const [batchRestoring, setBatchRestoring] = useState(false);
  const [batchPreviewOpen, setBatchPreviewOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  
  // 日期筛选状态
  const [selectedRange, setSelectedRange] = useState<TimeRangeType>("近7天");
  const [dateRange, setDateRange] = useState<DateRange>(() => getTimeRangeDates("近7天"));
  
  // 分页状态 - 固定每页50条
  const PAGE_SIZE = 50;
  const [currentPage, setCurrentPage] = useState(1);

  const { data: auditLogsPage, isLoading: loading, isError: isErrorLogs } = useQuery({
    queryKey: ['operation-logs', effectiveTenantId ?? '', currentPage, searchTerm, moduleFilter, operationFilter, operatorFilter, restoreStatusFilter, dateRange],
    queryFn: async () => {
      return fetchAuditLogsPage(currentPage, PAGE_SIZE, {
        module: moduleFilter,
        operationType: operationFilter,
        operatorAccount: operatorFilter,
        restoreStatus: restoreStatusFilter,
        searchTerm: searchTerm || undefined,
        tenantId: effectiveTenantId,
        dateRange: dateRange.start || dateRange.end ? { start: dateRange.start, end: dateRange.end } : undefined,
      });
    },
    refetchOnMount: 'always',
    retry: 3,
    enabled: activeTab === "logs",
  });
  const isAdmin = () => {
    return userIsAdmin;
  };

  // Realtime handled centrally by dataRefreshManager → TABLE_QUERY_KEYS['operation_logs']

  // 处理日期范围变化
  const handleDateRangeChange = (range: TimeRangeType, start?: Date, end?: Date) => {
    setSelectedRange(range);
    if (range === "自定义" && start && end) {
      setDateRange(getTimeRangeDates(range, start, end));
    } else {
      setDateRange(getTimeRangeDates(range));
    }
  };

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['operation-logs'] });
    notify.success(t("日志已刷新", "Logs refreshed"));
  };

  const handleExport = () => {
    exportToCSV(filteredLogs, [
      { key: 'timestamp', label: '时间', labelEn: 'Time', formatter: (v) => formatDateTimeForExport(v) },
      { key: 'operatorAccount', label: '操作员', labelEn: 'Operator' },
      { key: 'operatorRole', label: '角色', labelEn: 'Role' },
      { key: 'module', label: '模块', labelEn: 'Module', formatter: (v) => getModuleName(v as ModuleType, language as 'zh' | 'en') },
      { key: 'operationType', label: '操作类型', labelEn: 'Operation', formatter: (v) => getOperationName(v as OperationType, language as 'zh' | 'en') },
      { key: 'objectId', label: '对象ID', labelEn: 'Object ID' },
      { key: 'objectDescription', label: '描述', labelEn: 'Description' },
      { key: 'isRestored', label: '已恢复', labelEn: 'Restored', formatter: (v) => v ? t('是', 'Yes') : t('否', 'No') },
    ], t('操作审计日志', 'Audit Logs'), language === 'en');
    notify.success(t("导出成功", "Export successful"));
  };

  const getDiffDisplay = (log: AuditLogEntry) => {
    return getObjectDiff(log.beforeData, log.afterData);
  };

  const handleRestore = async (log: AuditLogEntry) => {
    if (isRestoring) return; // 防重入
    
    if (!log.beforeData || !isRestorableModule(log.module)) {
      notify.error(t("此操作不支持恢复", "This operation cannot be restored"));
      return;
    }

    // 撤回操作不可恢复
    if (String(log.objectDescription ?? '').includes('撤回')) {
      notify.error(t("撤回操作不可恢复", "Undo operations cannot be restored"));
      return;
    }

    if (!userIsAdmin) {
      notify.error(t("只有管理员可以执行恢复操作", "Only admins can perform restore operations"));
      return;
    }

    setIsRestoring(true);
    try {
      const restoreAuditBody = {
        logId: log.id,
        objectId: log.objectId,
        beforeData: log.beforeData,
        objectDescription: log.objectDescription,
        operatorId: employee?.id,
        operatorName: employee?.real_name,
      };

      // 根据模块执行恢复 - 通过后端 API
      switch (log.module) {
        case 'member_management': {
          void queryClient.invalidateQueries({ queryKey: ['members'] });
          void queryClient.invalidateQueries({ queryKey: ['member-activity-page-data'] });
          void queryClient.invalidateQueries({ queryKey: ['activity-data-content'] });
          // 检查记录是否还存在
          const currentMember = await getMemberRow(String(log.objectId ?? ""));
          
          // 🔧 转换前端 camelCase 字段名到数据库 snake_case 字段名
          const mapMemberDataToDb = (data: any) => {
            if (!data) return data;
            const dbData: any = {};
            if (data.phone_number !== undefined) dbData.phone_number = data.phone_number;
            else if (data.phoneNumber !== undefined) dbData.phone_number = data.phoneNumber;
            
            if (data.member_code !== undefined) dbData.member_code = data.member_code;
            else if (data.memberCode !== undefined) dbData.member_code = data.memberCode;
            
            if (data.member_level !== undefined) dbData.member_level = data.member_level;
            else if (data.level !== undefined) dbData.member_level = data.level;
            
            if (data.currency_preferences !== undefined) dbData.currency_preferences = data.currency_preferences;
            else if (data.preferredCurrency !== undefined) dbData.currency_preferences = data.preferredCurrency;
            
            if (data.remark !== undefined) dbData.remark = data.remark;
            
            if (data.customer_feature !== undefined) dbData.customer_feature = data.customer_feature;
            else if (data.customerFeature !== undefined) dbData.customer_feature = data.customerFeature;
            else if (data.tradeFeature !== undefined) dbData.customer_feature = data.tradeFeature;
            
            if (data.source_id !== undefined) dbData.source_id = data.source_id;
            else if (data.sourceId !== undefined) dbData.source_id = data.sourceId;
            
            if (data.creator_id !== undefined) dbData.creator_id = data.creator_id;
            else if (data.recorderId !== undefined) dbData.creator_id = data.recorderId;
            
            if (data.common_cards !== undefined) dbData.common_cards = data.common_cards;
            else if (data.commonCards !== undefined) dbData.common_cards = data.commonCards;
            
            if (data.bank_card !== undefined) dbData.bank_card = data.bank_card;
            else if (data.bankCard !== undefined) dbData.bank_card = data.bankCard;
            
            return dbData;
          };
          
          const restoreData = mapMemberDataToDb(log.beforeData);
          
          if (!currentMember) {
            await createMemberRow({ ...restoreData, id: log.objectId });
            
            logOperation('member_management', 'restore', log.objectId, null, log.beforeData,
              `恢复已删除的会员数据: ${log.objectDescription || log.objectId}`);
          } else {
            await patchMemberRow(String(log.objectId ?? ""), restoreData);
            
            logOperation('member_management', 'restore', log.objectId, currentMember, log.beforeData,
              `恢复会员数据: ${log.objectDescription || log.objectId}`);
          }
          break;
        }
        case 'employee_management': {
          void queryClient.invalidateQueries({ queryKey: ['employees-management'] });
          const currentEmployee = await getEmployeeRow(String(log.objectId ?? ""));
          
          const restoreData = { ...log.beforeData };
          delete restoreData.password_hash;
          
          if (!currentEmployee) {
            await createEmployeeRow({ ...restoreData, id: log.objectId });
            
            logOperation('employee_management', 'restore', log.objectId, null, restoreData,
              `恢复已删除的员工数据: ${log.objectDescription || log.objectId}`);
          } else {
            await patchEmployeeRow(String(log.objectId ?? ""), restoreData);
            
            logOperation('employee_management', 'restore', log.objectId, currentEmployee, restoreData,
              `恢复员工数据: ${log.objectDescription || log.objectId}`);
          }
          break;
        }
        case 'order_management': {
          // 通过后端 API 执行订单恢复
          await restoreOrderFromAudit(restoreAuditBody);
          
          queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['usdt-orders'] });
          queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
          queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
          notifyDataMutation({ table: 'orders', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          notifyDataMutation({ table: 'points_ledger', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          break;
        }
        case 'activity_gift': {
          await restoreActivityGiftFromAudit(restoreAuditBody);
          
          void queryClient.invalidateQueries({ queryKey: ['activity-records'] });
          void queryClient.invalidateQueries({ queryKey: ['member-activity-page-data'] });
          void queryClient.invalidateQueries({ queryKey: ['points-ledger'] });
          notifyDataMutation({ table: 'activity_gifts', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          notifyDataMutation({ table: 'points_ledger', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          break;
        }
        case 'card_management': {
          await restoreCardFromAudit(restoreAuditBody);
          void queryClient.invalidateQueries({ queryKey: ['vendors'] });
          void queryClient.invalidateQueries({ queryKey: ['shared-config'] });
          break;
        }
        case 'vendor_management': {
          await restoreVendorFromAudit(restoreAuditBody);
          void queryClient.invalidateQueries({ queryKey: ['vendors'] });
          void queryClient.invalidateQueries({ queryKey: ['shared-config'] });
          break;
        }
        case 'provider_management': {
          await restorePaymentProviderFromAudit(restoreAuditBody);
          void queryClient.invalidateQueries({ queryKey: ['vendors'] });
          void queryClient.invalidateQueries({ queryKey: ['shared-config'] });
          break;
        }
        case 'activity_type': {
          await restoreActivityTypeFromAudit(restoreAuditBody);
          void queryClient.invalidateQueries({ queryKey: ['shared-config'] });
          break;
        }
        case 'currency_settings': {
          await restoreCurrencyFromAudit(restoreAuditBody);
          void queryClient.invalidateQueries({ queryKey: ['shared-config'] });
          break;
        }
        case 'customer_source': {
          await restoreCustomerSourceFromAudit(restoreAuditBody);
          void queryClient.invalidateQueries({ queryKey: ['shared-config'] });
          break;
        }
        case 'referral': {
          await restoreReferralFromAudit(restoreAuditBody);
          void queryClient.invalidateQueries({ queryKey: ['referral-relations'] });
          break;
        }
        case 'system_settings': {
          const currentData = await loadSharedData(log.objectId as any);
          await saveSharedData(log.objectId as any, log.beforeData);
          
          void queryClient.invalidateQueries({ queryKey: ['shared-config'] });
          logOperation('system_settings', 'restore', log.objectId, currentData, log.beforeData,
            `恢复系统设置: ${log.objectDescription || log.objectId}`);
          break;
        }
        case 'merchant_settlement': {
          // 恢复商家结算数据（提款/充值记录）
          const { 
            getCardMerchantSettlementsAsync, 
            getPaymentProviderSettlementsAsync,
            addWithdrawal,
            addRecharge,
          } = await import('@/stores/merchantSettlementStore');
          const { createLedgerEntry } = await import('@/services/finance/ledgerTransactionService');
          
          const beforeData = log.beforeData;
          if (!beforeData) {
            notify.error(t('无法恢复：缺少原始数据', 'Cannot restore: missing original data'));
            return;
          }
          
          // Determine if this is a withdrawal (WD_) or recharge (RC_) by objectId
          const objectId = log.objectId;
          const objectIdStr = String(objectId ?? '');
          const description = String(log.objectDescription ?? '');
          
          if (objectIdStr.startsWith('WD_')) {
            // Extract vendor name from description: "删除卡商提款: VendorName"
            const vendorMatch = description.match(/[:：]\s*(.+?)(?:\s*-|$)/);
            const vendorName = vendorMatch?.[1]?.trim() || beforeData.vendorName || '';
            
            if (!vendorName) {
              notify.error(t('无法恢复：无法确定卡商名称', 'Cannot restore: vendor name not found'));
              return;
            }
            
            // Re-add the withdrawal
            const settlements = await getCardMerchantSettlementsAsync();
            const settlement = settlements.find(s => s.vendorName === vendorName);
            
            if (settlement) {
              // Check if already exists
              const exists = settlement.withdrawals.some(w => String(w.id) === objectIdStr);
              if (exists) {
                notify.error(t('该提款记录已存在，无需恢复', 'Withdrawal record already exists'));
                return;
              }
              
              // Restore the record
              settlement.withdrawals.push(beforeData);
              await saveSharedData('cardMerchantSettlements', settlements);
              
              // Re-create ledger entry
              await createLedgerEntry({
                accountType: 'card_vendor',
                accountId: vendorName,
                sourceType: 'withdrawal_restore',
                sourceId: `wdrestore_${objectIdStr}_${Date.now()}`,
                amount: -beforeData.settlementTotal,
                note: `恢复提款: ${beforeData.withdrawalAmountUsdt} USDT × ${beforeData.usdtRate} = ¥${beforeData.settlementTotal}`,
                operatorId: employee?.id,
                operatorName: employee?.real_name,
              });
            }
            
            logOperation('merchant_settlement', 'restore', objectId, null, beforeData,
              `恢复已删除的卡商提款: ${vendorName} - ¥${beforeData.settlementTotal}`);
            
            notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          } else if (objectIdStr.startsWith('RC_')) {
            // Extract provider name from description: "删除代付商家充值: ProviderName"
            const providerMatch = description.match(/[:：]\s*(.+?)(?:\s*-|$)/);
            const providerName = providerMatch?.[1]?.trim() || beforeData.providerName || '';
            
            if (!providerName) {
              notify.error(t('无法恢复：无法确定代付商家名称', 'Cannot restore: provider name not found'));
              return;
            }
            
            // Re-add the recharge
            const settlements = await getPaymentProviderSettlementsAsync();
            const settlement = settlements.find(s => s.providerName === providerName);
            
            if (settlement) {
              const exists = settlement.recharges.some(r => String(r.id) === objectIdStr);
              if (exists) {
                notify.error(t('该充值记录已存在，无需恢复', 'Recharge record already exists'));
                return;
              }
              
              settlement.recharges.push(beforeData);
              await saveSharedData('paymentProviderSettlements', settlements);
              
              await createLedgerEntry({
                accountType: 'payment_provider',
                accountId: providerName,
                sourceType: 'recharge_restore',
                sourceId: `rcrestore_${objectIdStr}_${Date.now()}`,
                amount: beforeData.settlementTotal,
                note: `恢复充值: ${beforeData.rechargeAmountUsdt} USDT × ${beforeData.usdtRate} = ¥${beforeData.settlementTotal}`,
                operatorId: employee?.id,
                operatorName: employee?.real_name,
              });
            }
            
            logOperation('merchant_settlement', 'restore', objectId, null, beforeData,
              `恢复已删除的代付商家充值: ${providerName} - ¥${beforeData.settlementTotal}`);
            
            notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          } else {
            // Handle update operations (initial balance, withdrawal edits, recharge edits)
            // beforeData contains the previous state of the settlement
            const { createLedgerEntry, createAdjustmentEntry, setInitialBalanceLedger } = await import('@/services/finance/ledgerTransactionService');
            
            // Determine if this is a card vendor or payment provider operation
            const isProviderOp = description.includes('代付') || description.includes('充值');
            const isVendorOp = description.includes('卡商') || description.includes('提款');
            
            if (isVendorOp || (!isProviderOp && beforeData.vendorName)) {
              // Card vendor settlement restore
              const vendorName = beforeData.vendorName || objectIdStr;
              const settlements = await getCardMerchantSettlementsAsync();
              const idx = settlements.findIndex(s => s.vendorName === vendorName);
              const { reverseAllEntriesForSource } = await import('@/services/finance/ledgerTransactionService');
              
              if (idx !== -1) {
                const currentSettlement = settlements[idx];
                
                // Restore the full settlement state from beforeData
                if (beforeData.initialBalance !== undefined) {
                  settlements[idx].initialBalance = beforeData.initialBalance;
                }
                if (beforeData.lastResetTime !== undefined) {
                  settlements[idx].lastResetTime = beforeData.lastResetTime;
                }
                if (beforeData.postResetAdjustment !== undefined) {
                  settlements[idx].postResetAdjustment = beforeData.postResetAdjustment;
                }
                
                // Handle withdrawal edits: compare beforeData.withdrawals with current to find changed records
                if (beforeData.withdrawals !== undefined) {
                  const beforeWithdrawals = beforeData.withdrawals || [];
                  const currentWithdrawals = currentSettlement.withdrawals || [];
                  
                  // Find records that were modified (same id, different settlementTotal)
                  for (const bw of beforeWithdrawals) {
                    const cw = currentWithdrawals.find((w: any) => w.id === bw.id);
                    if (cw && Math.abs(cw.settlementTotal - bw.settlementTotal) > 0.01) {
                      // Reverse existing entries for this record, then create new one with restored value
                      await reverseAllEntriesForSource({
                        accountType: 'card_vendor',
                        accountId: vendorName,
                        orderId: bw.id,
                        sourcePrefix: 'wd_',
                        adjPrefix: 'wadj_',
                        note: `操作日志恢复提款: ¥${cw.settlementTotal} → ¥${bw.settlementTotal}`,
                        operatorId: employee?.id,
                        operatorName: employee?.real_name,
                      });
                      // Create new entry with restored value
                      await createLedgerEntry({
                        accountType: 'card_vendor',
                        accountId: vendorName,
                        sourceType: 'withdrawal_restore',
                        sourceId: `wd_${bw.id}`,
                        amount: -bw.settlementTotal,
                        note: `恢复提款: ${bw.withdrawalAmountUsdt} USDT × ${bw.usdtRate} = ¥${bw.settlementTotal}`,
                        operatorId: employee?.id,
                        operatorName: employee?.real_name,
                      });
                    }
                  }
                  
                  settlements[idx].withdrawals = beforeWithdrawals;
                }
                
                await saveSharedData('cardMerchantSettlements', settlements);
                
                // If initial balance was changed, restore it in ledger
                if (beforeData.initialBalance !== undefined && beforeData.initialBalance !== currentSettlement.initialBalance) {
                  await setInitialBalanceLedger({
                    accountType: 'card_vendor',
                    accountId: vendorName,
                    newBalance: beforeData.initialBalance,
                    previousBalance: currentSettlement.initialBalance || 0,
                    operatorId: employee?.id,
                    operatorName: employee?.real_name,
                  });
                  notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
                }
              }
              
              logOperation('merchant_settlement', 'restore', objectId, null, beforeData,
                `恢复卡商结算数据: ${vendorName}`);
              notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
            } else if (isProviderOp || beforeData.providerName) {
              // Payment provider settlement restore
              const providerName = beforeData.providerName || objectIdStr;
              const settlements = await getPaymentProviderSettlementsAsync();
              const idx = settlements.findIndex(s => s.providerName === providerName);
              const { reverseAllEntriesForSource } = await import('@/services/finance/ledgerTransactionService');
              
              if (idx !== -1) {
                const currentSettlement = settlements[idx];
                
                if (beforeData.initialBalance !== undefined) {
                  settlements[idx].initialBalance = beforeData.initialBalance;
                }
                if (beforeData.lastResetTime !== undefined) {
                  settlements[idx].lastResetTime = beforeData.lastResetTime;
                }
                if (beforeData.postResetAdjustment !== undefined) {
                  settlements[idx].postResetAdjustment = beforeData.postResetAdjustment;
                }
                
                // Handle recharge edits: compare beforeData.recharges with current to find changed records
                if (beforeData.recharges !== undefined) {
                  const beforeRecharges = beforeData.recharges || [];
                  const currentRecharges = currentSettlement.recharges || [];
                  
                  for (const br of beforeRecharges) {
                    const cr = currentRecharges.find((r: any) => r.id === br.id);
                    if (cr && Math.abs(cr.settlementTotal - br.settlementTotal) > 0.01) {
                      // Reverse existing entries for this record, then create new one with restored value
                      await reverseAllEntriesForSource({
                        accountType: 'payment_provider',
                        accountId: providerName,
                        orderId: br.id,
                        sourcePrefix: 'rc_',
                        adjPrefix: 'radj_',
                        note: `操作日志恢复充值: ¥${cr.settlementTotal} → ¥${br.settlementTotal}`,
                        operatorId: employee?.id,
                        operatorName: employee?.real_name,
                      });
                      // Create new entry with restored value
                      await createLedgerEntry({
                        accountType: 'payment_provider',
                        accountId: providerName,
                        sourceType: 'recharge_restore',
                        sourceId: `rc_${br.id}`,
                        amount: br.settlementTotal,
                        note: `恢复充值: ${br.rechargeAmountUsdt} USDT × ${br.usdtRate} = ¥${br.settlementTotal}`,
                        operatorId: employee?.id,
                        operatorName: employee?.real_name,
                      });
                    }
                  }
                  
                  settlements[idx].recharges = beforeRecharges;
                }
                
                await saveSharedData('paymentProviderSettlements', settlements);
                
                if (beforeData.initialBalance !== undefined && beforeData.initialBalance !== currentSettlement.initialBalance) {
                  await setInitialBalanceLedger({
                    accountType: 'payment_provider',
                    accountId: providerName,
                    newBalance: beforeData.initialBalance,
                    previousBalance: currentSettlement.initialBalance || 0,
                    operatorId: employee?.id,
                    operatorName: employee?.real_name,
                  });
                  notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
                }
              }
              
              logOperation('merchant_settlement', 'restore', objectId, null, beforeData,
                `恢复代付商家结算数据: ${providerName}`);
              notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
            } else {
              notify.error(t('此类型的商家结算操作暂不支持恢复', 'This type of settlement operation cannot be restored'));
              return;
            }
          }
          void queryClient.invalidateQueries({ queryKey: ['merchant-settlement'] });
          void queryClient.invalidateQueries({ queryKey: ['shared-config'] });
          break;
        }
        default:
          notify.error(t("此模块不支持恢复", "This module does not support restore"));
          return;
      }

      const markedOk = await markLogAsRestored(log.id, employee?.id, effectiveTenantId);
      const { refreshAuditLogCache: refresh } = await import('@/stores/auditLogStore');
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['operation-logs'] });
      if (markedOk) {
        notify.success(t("数据已恢复，并生成了恢复操作日志", "Data restored and logged"));
      } else {
        notify.error(
          t(
            "数据已恢复，但无法将本条日志标为「已恢复」。请刷新页面后重试。",
            "Data was restored, but the log could not be marked as restored. Please refresh and try again.",
          ),
        );
      }
      setRestoreConfirm(null);
    } catch (error: any) {
      console.error('恢复失败:', error);
      notify.error(t(`恢复失败: ${error?.message || '未知错误'}`, `Restore failed: ${error?.message || 'Unknown error'}`));
    } finally {
      setIsRestoring(false);
    }
  };

  const getOperationBadge = (type: OperationType) => {
    const key = normalizeOperationTypeKey(type) as OperationType;
    const colors: Record<OperationType, string> = {
      create: "bg-green-500",
      update: "bg-blue-500",
      cancel: "bg-yellow-500",
      restore: "bg-cyan-500",
      delete: "bg-red-500",
      audit: "bg-orange-500",
      reject: "bg-rose-500",
      status_change: "bg-purple-500",
      force_logout: "bg-gray-500",
      batch_delete: "bg-red-600",
      mysql_mysqldump: "bg-indigo-500",
      knowledge_category_patch_delegated: "bg-teal-500",
      shared_data_upsert_delegated: "bg-teal-500",
    };
    return <Badge className={colors[key] ?? 'bg-gray-500'}>{getOperationName(type, language as 'zh' | 'en')}</Badge>;
  };

  const getLogAccent = (type: OperationType): "default" | "success" | "danger" | "info" => {
    switch (normalizeOperationTypeKey(type) as OperationType) {
      case 'delete':
      case 'batch_delete':
      case 'cancel':
      case 'reject':
        return 'danger';
      case 'create':
        return 'success';
      case 'update':
      case 'status_change':
      case 'knowledge_category_patch_delegated':
      case 'shared_data_upsert_delegated':
        return 'info';
      case 'mysql_mysqldump':
        return 'info';
      default:
        return 'default';
    }
  };

  // 服务端分页：直接使用接口返回的当前页数据
  const filteredLogs = auditLogsPage?.logs ?? [];
  const totalCount = auditLogsPage?.totalCount ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const paginatedLogs = filteredLogs;
  
  // 筛选条件变化时重置分页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, moduleFilter, operationFilter, operatorFilter, restoreStatusFilter, dateRange]);

  const canRestore = (log: AuditLogEntry) => {
    // 撤回初始余额操作不可恢复（任何人都不行）
    const isUndoOperation = String(log.objectDescription ?? '').includes('撤回');
    return isAdmin() && log.beforeData && isRestorableModule(log.module) && !log.isRestored && normalizeOperationTypeKey(log.operationType) !== 'restore' && !isUndoOperation;
  };

  // 可批量恢复的日志
  const restorableLogs = useMemo(() => {
    return filteredLogs.filter(log => canRestore(log));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredLogs]);

  const logKpiItems = useMemo(
    () => [
      { label: t("总记录数", "Total records"), value: String(totalCount) },
      { label: t("本页", "This page"), value: String(paginatedLogs.length) },
      { label: t("可恢复（本页）", "Restorable (page)"), value: String(restorableLogs.length) },
      { label: t("已选中", "Selected"), value: String(selectedLogs.size) },
    ],
    [totalCount, paginatedLogs.length, restorableLogs.length, selectedLogs.size, t],
  );

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedLogs.size === restorableLogs.length) {
      setSelectedLogs(new Set());
    } else {
      setSelectedLogs(new Set(restorableLogs.map(log => log.id)));
    }
  };

  // 单选
  const handleSelectLog = (logId: string) => {
    const newSelected = new Set(selectedLogs);
    if (newSelected.has(logId)) {
      newSelected.delete(logId);
    } else {
      newSelected.add(logId);
    }
    setSelectedLogs(newSelected);
  };

  // 批量恢复
  const handleBatchRestore = async () => {
    if (selectedLogs.size === 0) return;
    
    setBatchRestoring(true);
    let successCount = 0;
    let failCount = 0;
    
    for (const logId of selectedLogs) {
      const log = filteredLogs.find(l => l.id === logId);
      if (log && canRestore(log)) {
        try {
          // 复用单个恢复逻辑
          await handleRestore(log);
          successCount++;
        } catch (error) {
          console.error(`批量恢复失败 (${logId}):`, error);
          failCount++;
        }
      }
    }
    
    setBatchRestoring(false);
    setBatchRestoreConfirm(false);
    setSelectedLogs(new Set());
    
    if (successCount > 0) {
      notify.success(t(`批量恢复完成: ${successCount} 条成功${failCount > 0 ? `, ${failCount} 条失败` : ''}`, `Batch restore done: ${successCount} succeeded${failCount > 0 ? `, ${failCount} failed` : ''}`));
    } else if (failCount > 0) {
      notify.error(t(`批量恢复失败: ${failCount} 条记录恢复失败`, `Batch restore failed: ${failCount} records failed`));
    }
    
    await refreshAuditLogCache();
    await queryClient.invalidateQueries({ queryKey: ['operation-logs'] });
  };

  const formatValue = (value: any, fieldKey?: string): string => {
    if (fieldKey) return formatLogFieldValue(fieldKey, value, language as 'zh' | 'en');
    return formatDisplayValue(value, language as 'zh' | 'en');
  };

  const viewingLogPayloadNotes = useMemo(() => {
    if (!viewingLog) return [];
    return summarizeOperationLogPayloadIssues(
      language === 'en' ? 'en' : 'zh',
      viewingLog.beforeData,
      viewingLog.afterData,
    );
  }, [viewingLog, language]);

  // 过滤隐藏字段
  const filterHiddenFields = (data: any): [string, any][] => {
    if (!data || typeof data !== 'object') return [];
    return Object.entries(data).filter(
      ([key]) => !HIDDEN_LOG_FIELDS.has(key) && !key.startsWith('__'),
    );
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <Tabs value={activeTab} onValueChange={handleOperationLogsTabChange} className="flex flex-col h-full">
        <TabsList className="shrink-0 flex flex-wrap gap-1 h-auto min-h-9">
          <TabsTrigger value="logs">{t("后台审计", "Backend audit")}</TabsTrigger>
          <TabsTrigger value="errors">{t("前端异常", "Frontend errors")}</TabsTrigger>
          <TabsTrigger value="member">{t("会员端日志", "Member activity")}</TabsTrigger>
        </TabsList>

        <TabsContent value="errors" className="flex-1 mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            {t(
              "来自浏览器与员工端运行时的异常上报（error_reports），与后台审计表相互独立。",
              "Client-side error reports (error_reports), separate from server audit logs.",
            )}
          </p>
          <Suspense fallback={<TablePageSkeleton />}>
            <ErrorReportsPanel />
          </Suspense>
        </TabsContent>

        <TabsContent value="member" className="flex-1 mt-4 space-y-3">
          <PageHeader
            description={t(
              "会员在门户内的行为流水（member_operation_logs），与员工后台审计分离。",
              "Member-facing activity (member_operation_logs), separate from staff audit logs.",
            )}
          />
          <AdminOperationLogsTab />
        </TabsContent>

        <TabsContent value="logs" className="mt-0 flex flex-1 flex-col gap-4">
          {isErrorLogs ? (
            <div className="flex flex-col gap-4 py-8">
              <ErrorState
                title={t("操作日志加载失败", "Operation logs failed to load")}
                description={t("请确保后端服务已启动后重试。", "Ensure the backend is running, then retry.")}
              />
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => queryClient.invalidateQueries({ queryKey: ["operation-logs"] })}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("重试", "Retry")}
              </Button>
            </div>
          ) : loading ? (
            <TablePageSkeleton />
          ) : (
          <>
          <div className="shrink-0 space-y-3">
            <PageHeader
              description={t(
                "员工后台操作审计（operation_logs）：按时间与模块筛选，可导出；管理员可查看详情并恢复部分变更。",
                "Staff audit trail (operation_logs): filter by time and module, export; admins can open details and restore some changes.",
              )}
            />
            <KPIGrid items={logKpiItems} />
          </div>
      {useCompactLayout ? (
        <>
          {/* Mobile: compact filter area */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <div className="flex-1 min-w-0 overflow-x-auto mobile-tabs-scroll">
                <DateRangeFilter
                  value={selectedRange}
                  onChange={handleDateRangeChange}
                  dateRange={dateRange}
                />
              </div>
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-lg touch-manipulation" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-lg touch-manipulation"
                onClick={() => exportConfirm.requestExport(handleExport)}
              >
                <Download className="h-4 w-4" />
              </Button>
            </div>

            <MobileFilterBar
              searchValue={searchTerm}
              onSearchChange={setSearchTerm}
              placeholder={t("搜索操作人、描述...", "Search operator, desc...")}
              activeFilterCount={[moduleFilter !== 'all', operationFilter !== 'all', operatorFilter !== 'all', restoreStatusFilter !== 'all'].filter(Boolean).length}
              filterContent={
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={moduleFilter} onValueChange={setModuleFilter}>
                      <SelectTrigger className="h-10 text-xs touch-manipulation">
                        <SelectValue placeholder={t("模块", "Module")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('全部模块', 'All Modules')}</SelectItem>
                        {Object.keys(MODULE_NAMES).map((key) => (
                          <SelectItem key={key} value={key}>{getModuleName(key as ModuleType, language as 'zh' | 'en')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={operationFilter} onValueChange={setOperationFilter}>
                      <SelectTrigger className="h-10 text-xs touch-manipulation">
                        <SelectValue placeholder={t('操作', 'Operation')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('全部操作', 'All Operations')}</SelectItem>
                        {Object.keys(OPERATION_NAMES).map((key) => (
                          <SelectItem key={key} value={key}>{getOperationName(key as OperationType, language as 'zh' | 'en')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={operatorFilter} onValueChange={setOperatorFilter}>
                      <SelectTrigger className="h-10 text-xs touch-manipulation">
                        <SelectValue placeholder={t("操作人", "Operator")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("全部操作人", "All Operators")}</SelectItem>
                        {Array.from(new Set(filteredLogs.map(log => log.operatorAccount))).map((account) => (
                          <SelectItem key={String(account ?? '')} value={String(account ?? '')}>{String(account ?? '')}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={restoreStatusFilter} onValueChange={setRestoreStatusFilter}>
                      <SelectTrigger className="h-10 text-xs touch-manipulation">
                        <SelectValue placeholder={t("恢复状态", "Restore")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t("全部状态", "All Status")}</SelectItem>
                        <SelectItem value="restored">{t("已恢复", "Restored")}</SelectItem>
                        <SelectItem value="not_restored">{t("未恢复", "Not Restored")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(moduleFilter !== 'all' || operationFilter !== 'all' || operatorFilter !== 'all' || restoreStatusFilter !== 'all') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-10 w-full text-muted-foreground touch-manipulation"
                      onClick={() => {
                        setModuleFilter('all');
                        setOperationFilter('all');
                        setOperatorFilter('all');
                        setRestoreStatusFilter('all');
                      }}
                    >
                      {t("清除筛选", "Clear")}
                    </Button>
                  )}
                </>
              }
            />
          </div>

          {/* Mobile: summary bar + batch actions */}
          <div className="flex items-center justify-between px-0.5">
            <div className="flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-primary" />
              <span className="text-xs font-medium text-foreground">{t("操作日志", "Logs")}</span>
              <span className="text-[11px] text-muted-foreground tabular-nums">({totalCount})</span>
            </div>
            {isAdmin() && selectedLogs.size > 0 && (
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBatchPreviewOpen(true)}
                  className="h-8 text-xs text-blue-600 border-blue-300 touch-manipulation"
                >
                  <Eye className="h-3 w-3 mr-0.5" />
                  {t("预览", "Preview")} ({selectedLogs.size})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setBatchRestoreConfirm(true)}
                  className="h-8 text-xs text-amber-600 border-amber-300 touch-manipulation"
                >
                  <RotateCcw className="h-3 w-3 mr-0.5" />
                  {t("批量恢复", "Batch")} ({selectedLogs.size})
                </Button>
              </div>
            )}
          </div>

          {/* Mobile: card list */}
          <MobileCardList>
            {paginatedLogs.length === 0 ? (
              <MobileEmptyState message={t("暂无审计日志记录", "No audit logs found")} />
            ) : paginatedLogs.map((log) => (
              <MobileCard key={log.id} accent={getLogAccent(log.operationType)} className={log.isRestored ? 'opacity-50' : ''}>
                <div className="flex items-start gap-2.5">
                  {isAdmin() && canRestore(log) && (
                    <Checkbox
                      checked={selectedLogs.has(log.id)}
                      onCheckedChange={() => handleSelectLog(log.id)}
                      className="mt-0.5 h-5 w-5 touch-manipulation shrink-0"
                      aria-label={t("选择此记录", "Select")}
                    />
                  )}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-medium text-[13px] block truncate">{log.operatorAccount}</span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">{formatBeijingTime(log.timestamp)}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {getOperationBadge(log.operationType)}
                        {log.isRestored && <Badge variant="outline" className="text-[10px] px-1">{t("已恢复", "Done")}</Badge>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                        {getModuleName(log.module, language as 'zh' | 'en')}
                      </Badge>
                      <span className="text-muted-foreground truncate min-w-0" title={String(log.objectDescription || log.objectId || '')}>
                        {log.objectDescription ? cleanDescription(String(log.objectDescription)).slice(0, 30) : getReadableObjectId(log)}
                      </span>
                    </div>
                  </div>
                </div>

                <MobileCardCollapsible>
                  <MobileCardRow label={t("对象ID", "Object")} value={getReadableObjectId(log)} mono />
                  <MobileCardRow label={t("角色", "Role")} value={formatLogFieldValue('role', log.operatorRole, language as 'zh' | 'en')} />
                  <MobileCardRow label="IP" value={formatIpAddress(log.ipAddress != null ? String(log.ipAddress) : undefined, language as 'zh' | 'en')} mono />
                  {log.objectDescription && (
                    <MobileCardRow label={t("描述", "Desc")} value={cleanDescription(String(log.objectDescription))} />
                  )}
                </MobileCardCollapsible>

                <div className="flex items-center gap-2 pt-1.5">
                  <Button size="sm" variant="outline" className="flex-1 h-9 text-xs touch-manipulation" onClick={() => setViewingLog(log)}>
                    <Eye className="h-3.5 w-3.5 mr-1" />{t("详情", "Details")}
                  </Button>
                  {canRestore(log) && (
                    <Button size="sm" variant="outline" className="flex-1 h-9 text-xs touch-manipulation text-amber-600 border-amber-200 dark:border-amber-800" onClick={() => setRestoreConfirm(log)}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />{t("恢复", "Restore")}
                    </Button>
                  )}
                </div>
              </MobileCard>
            ))}
            <MobilePagination currentPage={currentPage} totalPages={totalPages} totalItems={totalCount} onPageChange={setCurrentPage} pageSize={PAGE_SIZE} />
          </MobileCardList>
        </>
      ) : (
      <>
      {/* Desktop: filter area */}
      <Card className="p-3 sm:p-4 shrink-0">
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <DateRangeFilter
                value={selectedRange}
                onChange={handleDateRangeChange}
                dateRange={dateRange}
              />
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4" />
                <span className="ml-1">{t("刷新", "Refresh")}</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportConfirm.requestExport(handleExport)}>
                <Download className="h-4 w-4" />
                <span className="ml-1">{t("导出", "Export")}</span>
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("搜索操作人、对象ID、描述...", "Search operator, object, desc...")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger className="w-28 h-9">
                  <SelectValue placeholder={t("模块", "Module")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('全部模块', 'All Modules')}</SelectItem>
                  {Object.keys(MODULE_NAMES).map((key) => (
                    <SelectItem key={key} value={key}>{getModuleName(key as ModuleType, language as 'zh' | 'en')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={operationFilter} onValueChange={setOperationFilter}>
                <SelectTrigger className="w-24 h-9">
                  <SelectValue placeholder={t('操作', 'Operation')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('全部操作', 'All Operations')}</SelectItem>
                  {Object.keys(OPERATION_NAMES).map((key) => (
                    <SelectItem key={key} value={key}>{getOperationName(key as OperationType, language as 'zh' | 'en')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={operatorFilter} onValueChange={setOperatorFilter}>
                <SelectTrigger className="w-28 h-9">
                  <SelectValue placeholder={t("操作人", "Operator")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("全部操作人", "All Operators")}</SelectItem>
                  {Array.from(new Set(filteredLogs.map(log => log.operatorAccount))).map((account) => (
                    <SelectItem key={String(account ?? '')} value={String(account ?? '')}>{String(account ?? '')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={restoreStatusFilter} onValueChange={setRestoreStatusFilter}>
                <SelectTrigger className="w-28 h-9">
                  <SelectValue placeholder={t("恢复状态", "Restore")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("全部状态", "All Status")}</SelectItem>
                  <SelectItem value="restored">{t("已恢复", "Restored")}</SelectItem>
                  <SelectItem value="not_restored">{t("未恢复", "Not Restored")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(moduleFilter !== 'all' || operationFilter !== 'all' || operatorFilter !== 'all' || restoreStatusFilter !== 'all' || searchTerm) && (
              <Button 
                variant="ghost" 
                size="sm"
                className="h-9 text-muted-foreground"
                onClick={() => {
                  setModuleFilter('all');
                  setOperationFilter('all');
                  setOperatorFilter('all');
                  setRestoreStatusFilter('all');
                  setSearchTerm('');
                }}
              >
                {t("清除筛选", "Clear")}
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Module Coverage Dashboard */}
      <ModuleCoverageDashboard logs={filteredLogs} />

      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              <Shield className="h-5 w-5 text-primary" />
              <Badge variant="outline" className="text-xs gap-1">
                <Lock className="h-3 w-3" />
                {t("只读", "Read-only")}
              </Badge>
              <span className="text-sm text-muted-foreground">
                ({totalCount}{t("条", " items")})
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isAdmin() && selectedLogs.size > 0 && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBatchPreviewOpen(true)}
                    className="text-blue-600 hover:text-blue-700 border-blue-300"
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    {t("预览选中", "Preview")} ({selectedLogs.size})
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBatchRestoreConfirm(true)}
                    className="text-amber-600 hover:text-amber-700 border-amber-300"
                  >
                    <CheckSquare className="h-4 w-4 mr-1" />
                    {t("批量恢复", "Batch Restore")} ({selectedLogs.size})
                  </Button>
                </>
              )}
              <span className="text-sm font-normal text-muted-foreground">
                {t("数据只允许追加，不允许修改或删除", "Data can only be appended, not modified or deleted")}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <StickyScrollTableContainer minWidth="1200px">
            <Table className="text-xs">
              <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                <TableRow className="bg-muted/50">
                  {isAdmin() && (
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={restorableLogs.length > 0 && selectedLogs.size === restorableLogs.length}
                        onCheckedChange={handleSelectAll}
                        aria-label="全选可恢复的记录"
                      />
                    </TableHead>
                  )}
                  <TableHead className="whitespace-nowrap px-1.5">{t("操作时间", "Time")}</TableHead>
                  <TableHead className="whitespace-nowrap px-1.5">{t("操作人", "Operator")}</TableHead>
                  <TableHead className="whitespace-nowrap px-1.5">{t("角色", "Role")}</TableHead>
                  <TableHead className="whitespace-nowrap px-1.5">{t("操作模块", "Module")}</TableHead>
                  <TableHead className="whitespace-nowrap px-1.5">{t("操作对象ID", "Object ID")}</TableHead>
                  <TableHead className="whitespace-nowrap px-1.5">{t("操作类型", "Type")}</TableHead>
                  <TableHead className="whitespace-nowrap px-1.5">IP</TableHead>
                  <TableHead className="whitespace-nowrap px-1.5 text-center sticky right-0 z-20 bg-muted shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)]">{t("操作", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedLogs.map((log) => (
                  <TableRow key={log.id} className={log.isRestored ? 'opacity-50' : ''}>
                    {isAdmin() && (
                      <TableCell>
                        {canRestore(log) ? (
                          <Checkbox
                            checked={selectedLogs.has(log.id)}
                            onCheckedChange={() => handleSelectLog(log.id)}
                            aria-label="选择此记录"
                          />
                        ) : (
                          <span className="w-4 h-4 block" />
                        )}
                      </TableCell>
                    )}
                    <TableCell className="font-mono whitespace-nowrap px-1.5">
                      {formatBeijingTime(log.timestamp)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-1.5">{log.operatorAccount}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap px-1.5">{formatLogFieldValue('role', log.operatorRole, language as 'zh' | 'en')}</TableCell>
                    <TableCell className="whitespace-nowrap px-1.5">{getModuleName(log.module, language as 'zh' | 'en')}</TableCell>
                    <TableCell
                      className="max-w-[160px] truncate px-1.5"
                      title={String(log.objectDescription || log.objectId || '')}
                    >
                      {getReadableObjectId(log)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-1.5">
                      {getOperationBadge(log.operationType)}
                      {log.isRestored && <Badge variant="outline" className="ml-1 text-xs">{t("已恢复", "Restored")}</Badge>}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap px-1.5">{formatIpAddress(log.ipAddress != null ? String(log.ipAddress) : undefined, language as 'zh' | 'en')}</TableCell>
                    <TableCell className="text-center whitespace-nowrap px-1.5 sticky right-0 z-10 bg-background shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                      <div className="flex items-center justify-center gap-1">
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => setViewingLog(log)}>
                          <Eye className="h-3 w-3 mr-1" />
                          {t("详情", "Details")}
                        </Button>
                        {canRestore(log) && (
                          <>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-blue-600 hover:text-blue-700"
                              onClick={() => setRestorePreview(log)}>
                              <Eye className="h-3 w-3 mr-1" />
                              {t("预览", "Preview")}
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-amber-600 hover:text-amber-700"
                              onClick={() => setRestoreConfirm(log)}>
                              <RotateCcw className="h-3 w-3 mr-1" />
                              {t("恢复", "Restore")}
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {paginatedLogs.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isAdmin() ? 9 : 8} className="text-center text-muted-foreground py-8">
                      {t("暂无审计日志记录", "No audit logs found")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </StickyScrollTableContainer>
          
          {/* Pagination */}
          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalCount}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
            onPageSizeChange={() => {}}
            pageSizeOptions={[50]}
          />
        </CardContent>
      </Card>
      </>
      )}

      <DrawerDetail
        open={!!viewingLog}
        onOpenChange={(open) => {
          if (!open) setViewingLog(null);
        }}
        title={
          <span className="flex items-center gap-2">
            <Eye className="h-5 w-5 shrink-0" />
            {t("操作详情", "Operation Details")}
          </span>
        }
        sheetMaxWidth="4xl"
      >
        {viewingLog && (
          <div className={cn("space-y-5", isMobile ? "pr-1" : "pr-1")}>
            <div className={isMobile ? "space-y-2" : "grid grid-cols-4 gap-4"}>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">{t("操作时间", "Time")}</Label>
                <p className="font-mono text-sm">{formatBeijingTime(viewingLog.timestamp)}</p>
              </div>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">{t("操作人账号", "Operator")}</Label>
                <p className="text-sm">{viewingLog.operatorAccount}</p>
              </div>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">{t("操作人角色", "Role")}</Label>
                <p className="text-sm">{formatLogFieldValue("role", viewingLog.operatorRole, language as "zh" | "en")}</p>
              </div>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">{t("操作IP", "IP Address")}</Label>
                <p className="font-mono text-sm" title={viewingLog.ipAddress || undefined}>
                  {formatIpAddress(viewingLog.ipAddress != null ? String(viewingLog.ipAddress) : undefined, language as "zh" | "en")}
                </p>
              </div>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">{t("操作模块", "Module")}</Label>
                <p className="text-sm">{getModuleName(viewingLog.module, language as "zh" | "en")}</p>
              </div>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">{t("操作类型", "Type")}</Label>
                <div>{getOperationBadge(viewingLog.operationType)}</div>
              </div>
              <div className={isMobile ? "" : "col-span-2"}>
                <Label className="text-xs text-muted-foreground">{t("操作对象", "Object")}</Label>
                <p className="break-all text-sm">{getReadableObjectId(viewingLog)}</p>
              </div>
            </div>

            {viewingLog.objectDescription && (
              <div>
                <Label className="text-muted-foreground">{t("操作描述", "Description")}</Label>
                <p>{cleanDescription(String(viewingLog.objectDescription))}</p>
              </div>
            )}

            {viewingLogPayloadNotes.length > 0 && (
              <Alert className="border-amber-200 bg-amber-50/90 dark:border-amber-800 dark:bg-amber-950/25">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-900 dark:text-amber-100">{t("数据快照说明", "About this snapshot")}</AlertTitle>
                <AlertDescription className="space-y-2 text-xs text-amber-900/95 dark:text-amber-50/90">
                  {viewingLogPayloadNotes.map((msg, i) => (
                    <p key={i} className="leading-relaxed">
                      {msg}
                    </p>
                  ))}
                </AlertDescription>
              </Alert>
            )}

            {(viewingLog.beforeData || viewingLog.afterData) && (
              <div className="space-y-4">
                <Label className="text-lg font-semibold">{t("数据变更对比", "Data Change Comparison")}</Label>
                {getDiffDisplay(viewingLog).length > 0 && (
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <Label className="mb-2 block text-sm text-muted-foreground">{t("变更字段高亮", "Changed Fields")}</Label>
                    <div className="space-y-2">
                      {getDiffDisplay(viewingLog)
                        .filter((diff) => !HIDDEN_LOG_FIELDS.has(diff.key) && !String(diff.key).startsWith("__"))
                        .map((diff, index) => (
                          <div key={index} className={cn("text-sm", isMobile ? "space-y-1" : "flex items-start gap-4")}>
                            <span className={cn("font-medium text-foreground", isMobile ? "block text-xs" : "min-w-[140px]")}>
                              {translateFieldName(diff.key, language as "zh" | "en")}:
                            </span>
                            <div className={cn("flex-1", isMobile ? "grid grid-cols-2 gap-1.5" : "flex gap-4")}>
                              <div className="min-w-0 flex-1">
                                <span className="block text-[10px] text-muted-foreground">{t("修改前", "Before")}</span>
                                <span className="mt-0.5 block break-all rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
                                  {formatValue(diff.before, diff.key)}
                                </span>
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="block text-[10px] text-muted-foreground">{t("修改后", "After")}</span>
                                <span className="mt-0.5 block break-all rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300">
                                  {formatValue(diff.after, diff.key)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                {getDiffDisplay(viewingLog).length === 0 && viewingLogPayloadNotes.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "无法展示字段级对比，请阅读上方「数据快照说明」。",
                      "Field-level comparison is unavailable — see the snapshot notice above.",
                    )}
                  </p>
                )}
                {getDiffDisplay(viewingLog).length === 0 && viewingLogPayloadNotes.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {t(
                      "未发现字段级差异（修改前后快照一致，或仅有非 JSON 的单一值）。",
                      "No field-level differences (snapshots are identical, or only a non-object value was logged).",
                    )}
                  </p>
                )}
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Button onClick={() => setViewingLog(null)}>{t("关闭", "Close")}</Button>
            </div>
          </div>
        )}
      </DrawerDetail>

      <DrawerDetail
        open={!!restoreConfirm}
        onOpenChange={(open) => {
          if (!open) setRestoreConfirm(null);
        }}
        title={
          <span className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 shrink-0 text-amber-600" />
            {t("确认恢复数据", "Confirm Data Restore")}
          </span>
        }
        sheetMaxWidth="2xl"
      >
        {restoreConfirm && (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {t(
                  "此操作将把数据恢复到修改前的状态。恢复操作本身也会被记录在审计日志中。",
                  "This will restore data to its previous state. The restore action will also be logged.",
                )}
              </p>
            </div>

            <div className={cn("gap-3 text-sm", isMobile ? "space-y-2" : "grid grid-cols-3")}>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">{t("操作模块", "Module")}</Label>
                <p className="text-sm font-medium">{getModuleName(restoreConfirm.module, language as "zh" | "en")}</p>
              </div>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">{t("操作类型", "Type")}</Label>
                <div>{getOperationBadge(restoreConfirm.operationType)}</div>
              </div>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">{t("对象", "Object")}</Label>
                <p className="max-w-[60%] truncate text-xs" title={String(restoreConfirm.objectId ?? "")}>
                  {getReadableObjectId(restoreConfirm)}
                </p>
              </div>
            </div>

            {restoreConfirm.objectDescription && (
              <div>
                <Label className="text-xs text-muted-foreground">{t("描述", "Description")}</Label>
                <p className="text-sm">{cleanDescription(String(restoreConfirm.objectDescription))}</p>
              </div>
            )}

            {restoreConfirm.beforeData && (
              <div>
                <Label className="mb-2 block text-sm font-medium text-green-700 dark:text-green-400">
                  {t("将要恢复的数据 (恢复前状态)", "Data to Restore (Previous State)")}
                </Label>
                <div className="rounded-lg border bg-green-50/50 p-3 dark:bg-green-900/20">
                  <div className="space-y-2">
                    {filterHiddenFields(restoreConfirm.beforeData)
                      .slice(0, isMobile ? 8 : 15)
                      .map(([key, value]) => (
                        <div key={key} className={cn("text-xs", isMobile ? "flex flex-col gap-0.5" : "flex gap-2")}>
                          <span className={cn("text-muted-foreground", isMobile ? "" : "min-w-[140px]")}>
                            {translateFieldName(key, language as "zh" | "en")}:
                          </span>
                          <span className="break-all text-foreground">{formatValue(value, key)}</span>
                        </div>
                      ))}
                    {filterHiddenFields(restoreConfirm.beforeData).length > 15 && (
                      <p className="text-xs italic text-muted-foreground">
                        ...{" "}
                        {t(
                          `还有 ${filterHiddenFields(restoreConfirm.beforeData).length - 15} 个字段`,
                          `${filterHiddenFields(restoreConfirm.beforeData).length - 15} more fields`,
                        )}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={() => setRestoreConfirm(null)} disabled={isRestoring}>
                {t("取消", "Cancel")}
              </Button>
              <Button
                onClick={() => restoreConfirm && handleRestore(restoreConfirm)}
                className="bg-amber-600 text-white hover:bg-amber-700"
                disabled={isRestoring}
              >
                {isRestoring ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : (
                  <RotateCcw className="mr-1 h-4 w-4" />
                )}
                {isRestoring ? t("恢复中...", "Restoring...") : t("确认恢复", "Confirm Restore")}
              </Button>
            </div>
          </div>
        )}
      </DrawerDetail>

      <DrawerDetail
        open={!!restorePreview}
        onOpenChange={(open) => {
          if (!open) setRestorePreview(null);
        }}
        title={
          <span className="flex items-center gap-2">
            <Eye className="h-5 w-5 shrink-0" />
            {t("恢复数据预览", "Restore Data Preview")}
          </span>
        }
        sheetMaxWidth="3xl"
      >
        {restorePreview && (
          <div className="space-y-4">
            <div className={cn("gap-3 text-sm", isMobile ? "space-y-1.5" : "grid grid-cols-3")}>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">{t("操作模块", "Module")}</Label>
                <p className="text-sm font-medium">{getModuleName(restorePreview.module, language as "zh" | "en")}</p>
              </div>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">{t("操作类型", "Type")}</Label>
                <div>{getOperationBadge(restorePreview.operationType)}</div>
              </div>
              <div className={isMobile ? "flex items-center justify-between" : ""}>
                <Label className="text-xs text-muted-foreground">{t("操作时间", "Time")}</Label>
                <p className="font-mono text-xs">{formatBeijingTime(restorePreview.timestamp)}</p>
              </div>
            </div>

            <div className={isMobile ? "space-y-4" : "grid grid-cols-2 gap-4"}>
              {restorePreview.beforeData && (
                <div>
                  <Label className="mb-2 block text-sm font-medium text-green-700 dark:text-green-400">
                    {t("恢复后数据 (原始状态)", "Restored Data (Original State)")}
                  </Label>
                  <div className="max-h-[300px] overflow-y-auto rounded-lg border bg-green-50/50 p-3 dark:bg-green-900/20">
                    <div className="space-y-1">
                      {filterHiddenFields(restorePreview.beforeData).map(([key, value]) => (
                        <div key={key} className={cn("text-xs", isMobile ? "flex flex-col gap-0.5" : "flex gap-2")}>
                          <span className={cn("shrink-0 text-muted-foreground", !isMobile && "min-w-[120px]")}>
                            {translateFieldName(key, language as "zh" | "en")}:
                          </span>
                          <span className="break-all text-foreground">{formatValue(value, key)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {restorePreview.afterData && (
                <div>
                  <Label className="mb-2 block text-sm font-medium text-red-700 dark:text-red-400">
                    {t("当前状态 (将被覆盖)", "Current State (Will Be Overwritten)")}
                  </Label>
                  <div className="max-h-[300px] overflow-y-auto rounded-lg border bg-red-50/50 p-3 dark:bg-red-900/20">
                    <div className="space-y-1">
                      {filterHiddenFields(restorePreview.afterData).map(([key, value]) => (
                        <div key={key} className={cn("text-xs", isMobile ? "flex flex-col gap-0.5" : "flex gap-2")}>
                          <span className={cn("shrink-0 text-muted-foreground", !isMobile && "min-w-[120px]")}>
                            {translateFieldName(key, language as "zh" | "en")}:
                          </span>
                          <span className="break-all text-foreground">{formatValue(value, key)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={() => setRestorePreview(null)}>
                {t("关闭", "Close")}
              </Button>
              <Button
                onClick={() => {
                  const next = restorePreview;
                  setRestorePreview(null);
                  setRestoreConfirm(next);
                }}
                className="bg-amber-600 text-white hover:bg-amber-700"
              >
                <RotateCcw className="mr-1 h-4 w-4" />
                {t("继续恢复", "Continue Restore")}
              </Button>
            </div>
          </div>
        )}
      </DrawerDetail>

      <DrawerDetail
        open={batchPreviewOpen}
        onOpenChange={setBatchPreviewOpen}
        title={
          <span className="flex items-center gap-2">
            <Eye className="h-5 w-5 shrink-0" />
            {t(`批量恢复预览 (${selectedLogs.size} 条记录)`, `Batch Restore Preview (${selectedLogs.size} items)`)}
          </span>
        }
        sheetMaxWidth="4xl"
      >
        <div className="space-y-4">
          <div className="space-y-3">
            {Array.from(selectedLogs).map((logId) => {
              const log = filteredLogs.find((l) => l.id === logId);
              if (!log) return null;
              return (
                <div key={logId} className="rounded-lg border bg-muted/30 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{getModuleName(log.module, language as "zh" | "en")}</Badge>
                      {getOperationBadge(log.operationType)}
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">{formatBeijingTime(log.timestamp)}</span>
                  </div>
                  {log.objectDescription && (
                    <p className="mb-2 text-sm text-foreground">{cleanDescription(String(log.objectDescription))}</p>
                  )}
                  {log.beforeData && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium">{t("恢复数据预览：", "Restore preview: ")}</span>
                      <span className="ml-1 font-mono">
                        {filterHiddenFields(log.beforeData)
                          .slice(0, 3)
                          .map(([k, v]) => `${translateFieldName(k, language as "zh" | "en")}: ${formatValue(v, k)}`)
                          .join(" | ")}
                        {filterHiddenFields(log.beforeData).length > 3 && " ..."}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" onClick={() => setBatchPreviewOpen(false)}>
              {t("关闭", "Close")}
            </Button>
            <Button
              onClick={() => {
                setBatchPreviewOpen(false);
                setBatchRestoreConfirm(true);
              }}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              <RotateCcw className="mr-1 h-4 w-4" />
              {t("继续批量恢复", "Continue Batch Restore")}
            </Button>
          </div>
        </div>
      </DrawerDetail>

      {/* Batch Restore Confirmation */}
      <AlertDialog open={batchRestoreConfirm} onOpenChange={setBatchRestoreConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认批量恢复？", "Confirm Batch Restore?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(`您已选择 ${selectedLogs.size} 条记录进行批量恢复。此操作将把这些数据恢复到修改前的状态。每条恢复操作都会被记录在审计日志中。`,
                `You have selected ${selectedLogs.size} records for batch restore. This will restore data to previous states. Each restore will be logged.`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchRestoring}>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleBatchRestore} disabled={batchRestoring}>
              {batchRestoring ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  {t("恢复中...", "Restoring...")}
                </>
              ) : (
                t(`确认恢复 ${selectedLogs.size} 条`, `Confirm Restore ${selectedLogs.size} items`)
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
          </>
          )}
        </TabsContent>
      </Tabs>
      <ExportConfirmDialog
        open={exportConfirm.open}
        onOpenChange={exportConfirm.handleOpenChange}
        onConfirm={exportConfirm.handleConfirm}
      />
    </div>
  );
}
