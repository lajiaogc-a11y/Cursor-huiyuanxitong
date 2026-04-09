import { useState, useEffect, useMemo, lazy, Suspense } from "react";
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
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
import { RefreshCw, Eye, RotateCcw, Loader2, AlertTriangle } from "lucide-react";
import { notify } from "@/lib/notifyHub";
import {
  AuditLogEntry,
  getObjectDiff,
  isRestorableModule,
  logOperation,
  markLogAsRestored,
  getModuleName,
  refreshAuditLogCache,
} from "@/services/audit/auditLogService";
import { translateFieldName, formatDisplayValue, formatLogFieldValue, getReadableObjectId, cleanDescription, HIDDEN_LOG_FIELDS, formatIpAddress } from "@/lib/fieldLabelMap";
import { summarizeOperationLogPayloadIssues } from "@/lib/operationLogPayload";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { ExportConfirmDialog } from "@/components/ExportConfirmDialog";
import { useExportConfirm } from "@/hooks/ui/useExportConfirm";
import { useOperationLogsTable } from "@/hooks/audit/useOperationLogsTable";
import { useIsMobile, useIsTablet } from "@/hooks/ui/use-mobile";
import { notifyDataMutation } from "@/services/system/dataRefreshManager";
import { formatBeijingTime } from "@/lib/beijingTime";
import { saveSharedData, loadSharedData, type SharedDataKey } from "@/services/finance/sharedDataService";
import { PageHeader, KPIGrid, ErrorState } from "@/components/common";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { AdminOperationLogsTab } from "@/pages/member-portal/AdminOperationLogsTab";
import { operationLogsTabFromSearch, filterHiddenFields } from "@/pages/operationLogs/operationLogsHelpers";
import { OperationLogsFilterPanel } from "@/pages/operationLogs/OperationLogsFilterPanel";
import { OperationLogsLogsSection } from "@/pages/operationLogs/OperationLogsLogsSection";
import { OperationLogOperationBadge } from "@/pages/operationLogs/OperationLogOperationBadge";

// Legacy support
export interface OperationLog {
  id: string;
  timestamp: string;
  operator: string;
  module: string;
  action: string;
  details: string;
  ip?: string;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  targetId?: string;
  targetType?: string;
}

// Legacy addOperationLog - 使用数据库版本
export const addOperationLog = async (log: Omit<OperationLog, 'id' | 'timestamp'>) => {
  const { logOperationToDb } = await import('@/hooks/audit/useOperationLogs');
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
  const exportConfirm = useExportConfirm();
  const effectiveTenantId = employee?.is_platform_super_admin
    ? (viewingTenantId || null)
    : (viewingTenantId || employee?.tenant_id || null);

  const [viewingLog, setViewingLog] = useState<AuditLogEntry | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState<AuditLogEntry | null>(null);
  const [restorePreview, setRestorePreview] = useState<AuditLogEntry | null>(null);
  const [batchRestoreConfirm, setBatchRestoreConfirm] = useState(false);
  const [batchRestoring, setBatchRestoring] = useState(false);
  const [batchPreviewOpen, setBatchPreviewOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);

  const table = useOperationLogsTable({
    activeTab,
    effectiveTenantId,
    userIsAdmin,
    language,
    t,
  });

  const isAdmin = () => {
    return userIsAdmin;
  };

  const getDiffDisplay = (log: AuditLogEntry) => {
    return getObjectDiff(log.beforeData, log.afterData);
  };

  const handleRestore = async (log: AuditLogEntry, skipBusyGuard = false): Promise<boolean> => {
    if (!skipBusyGuard && isRestoring) return false;
    
    if (!log.beforeData || !isRestorableModule(log.module)) {
      notify.error(t("此操作不支持恢复", "This operation cannot be restored"));
      return false;
    }

    // 撤回操作不可恢复
    if (String(log.objectDescription ?? '').includes('撤回')) {
      notify.error(t("撤回操作不可恢复", "Undo operations cannot be restored"));
      return false;
    }

    if (!userIsAdmin) {
      notify.error(t("只有管理员可以执行恢复操作", "Only admins can perform restore operations"));
      return false;
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
          void table.queryClient.invalidateQueries({ queryKey: ['members'] });
          void table.queryClient.invalidateQueries({ queryKey: ['member-activity-page-data'] });
          void table.queryClient.invalidateQueries({ queryKey: ['activity-data-content'] });
          // 检查记录是否还存在
          const currentMember = await getMemberRow(String(log.objectId ?? ""));
          
          // 🔧 转换前端 camelCase 字段名到数据库 snake_case 字段名
          const mapMemberDataToDb = (data: Record<string, unknown> | null | undefined) => {
            if (!data) return data;
            const dbData: Record<string, unknown> = {};
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
          void table.queryClient.invalidateQueries({ queryKey: ['employees-management'] });
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
          
          table.queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
          table.queryClient.invalidateQueries({ queryKey: ['orders'] });
          table.queryClient.invalidateQueries({ queryKey: ['usdt-orders'] });
          table.queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
          table.queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
          notifyDataMutation({ table: 'orders', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          notifyDataMutation({ table: 'points_ledger', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          break;
        }
        case 'activity_gift': {
          await restoreActivityGiftFromAudit(restoreAuditBody);
          
          void table.queryClient.invalidateQueries({ queryKey: ['activity-records'] });
          void table.queryClient.invalidateQueries({ queryKey: ['member-activity-page-data'] });
          void table.queryClient.invalidateQueries({ queryKey: ['points-ledger'] });
          notifyDataMutation({ table: 'activity_gifts', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          notifyDataMutation({ table: 'points_ledger', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          break;
        }
        case 'card_management': {
          await restoreCardFromAudit(restoreAuditBody);
          void table.queryClient.invalidateQueries({ queryKey: ['vendors'] });
          void table.queryClient.invalidateQueries({ queryKey: ['shared-config'] });
          break;
        }
        case 'vendor_management': {
          await restoreVendorFromAudit(restoreAuditBody);
          void table.queryClient.invalidateQueries({ queryKey: ['vendors'] });
          void table.queryClient.invalidateQueries({ queryKey: ['shared-config'] });
          break;
        }
        case 'provider_management': {
          await restorePaymentProviderFromAudit(restoreAuditBody);
          void table.queryClient.invalidateQueries({ queryKey: ['vendors'] });
          void table.queryClient.invalidateQueries({ queryKey: ['shared-config'] });
          break;
        }
        case 'activity_type': {
          await restoreActivityTypeFromAudit(restoreAuditBody);
          void table.queryClient.invalidateQueries({ queryKey: ['shared-config'] });
          break;
        }
        case 'currency_settings': {
          await restoreCurrencyFromAudit(restoreAuditBody);
          void table.queryClient.invalidateQueries({ queryKey: ['shared-config'] });
          break;
        }
        case 'customer_source': {
          await restoreCustomerSourceFromAudit(restoreAuditBody);
          void table.queryClient.invalidateQueries({ queryKey: ['shared-config'] });
          break;
        }
        case 'referral': {
          await restoreReferralFromAudit(restoreAuditBody);
          void table.queryClient.invalidateQueries({ queryKey: ['referral-relations'] });
          break;
        }
        case 'system_settings': {
          const currentData = await loadSharedData(log.objectId as SharedDataKey);
          await saveSharedData(log.objectId as SharedDataKey, log.beforeData);
          
          void table.queryClient.invalidateQueries({ queryKey: ['shared-config'] });
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
          } = await import('@/services/finance/merchantSettlementService');
          const { createLedgerEntry } = await import('@/services/finance/ledgerTransactionService');
          
          const beforeData = log.beforeData;
          if (!beforeData) {
            notify.error(t('无法恢复：缺少原始数据', 'Cannot restore: missing original data'));
            return false;
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
              return false;
            }
            
            // Re-add the withdrawal
            const settlements = await getCardMerchantSettlementsAsync();
            const settlement = settlements.find(s => s.vendorName === vendorName);
            
            if (settlement) {
              // Check if already exists
              const exists = settlement.withdrawals.some(w => String(w.id) === objectIdStr);
              if (exists) {
                notify.error(t('该提款记录已存在，无需恢复', 'Withdrawal record already exists'));
                return false;
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
              return false;
            }
            
            // Re-add the recharge
            const settlements = await getPaymentProviderSettlementsAsync();
            const settlement = settlements.find(s => s.providerName === providerName);
            
            if (settlement) {
              const exists = settlement.recharges.some(r => String(r.id) === objectIdStr);
              if (exists) {
                notify.error(t('该充值记录已存在，无需恢复', 'Top-up record already exists'));
                return false;
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
                    const cw = currentWithdrawals.find((w: Record<string, unknown>) => w.id === bw.id);
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
                    const cr = currentRecharges.find((r: Record<string, unknown>) => r.id === br.id);
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
              return false;
            }
          }
          void table.queryClient.invalidateQueries({ queryKey: ['merchant-settlement'] });
          void table.queryClient.invalidateQueries({ queryKey: ['shared-config'] });
          break;
        }
        default:
          notify.error(t("此模块不支持恢复", "This module does not support restore"));
          return false;
      }

      const markedOk = await markLogAsRestored(log.id, employee?.id, effectiveTenantId);
      const { refreshAuditLogCache: refresh } = await import('@/services/audit/auditLogService');
      await refresh();
      await table.queryClient.invalidateQueries({ queryKey: ['operation-logs'] });
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
      return true;
    } catch (error: unknown) {
      console.error('恢复失败:', error);
      const msg = error instanceof Error ? error.message : '未知错误';
      notify.error(t(`恢复失败: ${msg}`, `Restore failed: ${msg}`));
      return false;
    } finally {
      setIsRestoring(false);
    }
  };

  // 批量恢复
  const handleBatchRestore = async () => {
    if (table.selectedLogs.size === 0) return;
    
    setBatchRestoring(true);
    let successCount = 0;
    let failCount = 0;
    
    for (const logId of table.selectedLogs) {
      const log = table.filteredLogs.find(l => l.id === logId);
      if (log && table.canRestore(log)) {
        const ok = await handleRestore(log, true);
        if (ok) {
          successCount++;
        } else {
          failCount++;
        }
      }
    }
    
    setBatchRestoring(false);
    setBatchRestoreConfirm(false);
    table.setSelectedLogs(new Set());
    
    if (successCount > 0) {
      notify.success(t(`批量恢复完成: ${successCount} 条成功${failCount > 0 ? `, ${failCount} 条失败` : ''}`, `Batch restore done: ${successCount} succeeded${failCount > 0 ? `, ${failCount} failed` : ''}`));
    } else if (failCount > 0) {
      notify.error(t(`批量恢复失败: ${failCount} 条记录恢复失败`, `Batch restore failed: ${failCount} records failed`));
    }
    
    await refreshAuditLogCache();
    await table.queryClient.invalidateQueries({ queryKey: ['operation-logs'] });
  };

  const formatValue = (value: unknown, fieldKey?: string): string => {
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
          {table.isErrorLogs ? (
            <div className="flex flex-col gap-4 py-8">
              <ErrorState
                title={t("操作日志加载失败", "Operation logs failed to load")}
                description={t("请确保后端服务已启动后重试。", "Ensure the backend is running, then retry.")}
              />
              <Button
                variant="outline"
                size="sm"
                className="w-fit"
                onClick={() => table.queryClient.invalidateQueries({ queryKey: ["operation-logs"] })}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("重试", "Retry")}
              </Button>
            </div>
          ) : table.loading ? (
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
            <KPIGrid items={table.logKpiItems} />
          </div>
          <OperationLogsFilterPanel
            useCompactLayout={useCompactLayout}
            t={t}
            language={language as "zh" | "en"}
            selectedRange={table.selectedRange}
            dateRange={table.dateRange}
            onDateRangeChange={table.handleDateRangeChange}
            onRefresh={table.handleRefresh}
            exporting={table.exporting}
            exportConfirm={exportConfirm}
            onExport={table.handleExport}
            searchTerm={table.searchTerm}
            onSearchTermChange={table.setSearchTerm}
            moduleFilter={table.moduleFilter}
            onModuleFilterChange={table.setModuleFilter}
            operationFilter={table.operationFilter}
            onOperationFilterChange={table.setOperationFilter}
            operatorFilter={table.operatorFilter}
            onOperatorFilterChange={table.setOperatorFilter}
            restoreStatusFilter={table.restoreStatusFilter}
            onRestoreStatusFilterChange={table.setRestoreStatusFilter}
            filteredLogs={table.filteredLogs}
            distinctOperators={table.auditLogsPage?.distinctOperators}
            onClearFilters={table.clearFilters}
          />
          <OperationLogsLogsSection
            useCompactLayout={useCompactLayout}
            t={t}
            language={language as "zh" | "en"}
            isAdmin={isAdmin}
            filteredLogs={table.filteredLogs}
            serverModuleCounts={table.auditLogsPage?.moduleCounts}
            totalCount={table.totalCount}
            paginatedLogs={table.paginatedLogs}
            totalPages={table.totalPages}
            currentPage={table.currentPage}
            onPageChange={table.setCurrentPage}
            pageSize={table.PAGE_SIZE}
            canRestore={table.canRestore}
            selectedLogs={table.selectedLogs}
            onSelectLog={table.handleSelectLog}
            onSelectAll={table.handleSelectAll}
            restorableLogs={table.restorableLogs}
            onViewDetail={setViewingLog}
            onRestoreConfirm={setRestoreConfirm}
            onRestorePreview={setRestorePreview}
            onBatchPreviewOpen={() => setBatchPreviewOpen(true)}
            onBatchRestoreConfirmOpen={() => setBatchRestoreConfirm(true)}
          />

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
                <div>
                  <OperationLogOperationBadge type={viewingLog.operationType} language={language as "zh" | "en"} />
                </div>
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
                <div>
                <OperationLogOperationBadge type={restoreConfirm.operationType} language={language as "zh" | "en"} />
              </div>
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
                <div>
                <OperationLogOperationBadge type={restorePreview.operationType} language={language as "zh" | "en"} />
              </div>
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
            {t(`批量恢复预览 (${table.selectedLogs.size} 条记录)`, `Batch Restore Preview (${table.selectedLogs.size} items)`)}
          </span>
        }
        sheetMaxWidth="4xl"
      >
        <div className="space-y-4">
          <div className="space-y-3">
            {Array.from(table.selectedLogs).map((logId) => {
              const log = table.filteredLogs.find((l) => l.id === logId);
              if (!log) return null;
              return (
                <div key={logId} className="rounded-lg border bg-muted/30 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{getModuleName(log.module, language as "zh" | "en")}</Badge>
                      <OperationLogOperationBadge type={log.operationType} language={language as "zh" | "en"} />
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
              {t(`您已选择 ${table.selectedLogs.size} 条记录进行批量恢复。此操作将把这些数据恢复到修改前的状态。每条恢复操作都会被记录在审计日志中。`,
                `You have selected ${table.selectedLogs.size} records for batch restore. This will restore data to previous states. Each restore will be logged.`)}
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
                t(`确认恢复 ${table.selectedLogs.size} 条`, `Confirm Restore ${table.selectedLogs.size} items`)
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
