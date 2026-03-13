import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from "react-router-dom";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const ErrorReportsPanel = lazy(() => import("@/components/ErrorReportsPanel"));
import { safeNumber } from "@/lib/safeCalc";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { RefreshCw, Search, Eye, RotateCcw, Shield, Lock, Loader2, Download, CheckSquare } from "lucide-react";
import { ModuleCoverageDashboard } from "@/components/ModuleCoverageDashboard";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
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
} from "@/stores/auditLogStore";
import DateRangeFilter from "@/components/DateRangeFilter";
import {
  TimeRangeType,
  DateRange,
  getTimeRangeDates,
} from "@/lib/dateFilter";
import { translateFieldName, formatDisplayValue, formatLogFieldValue, getReadableObjectId, cleanDescription, HIDDEN_LOG_FIELDS } from "@/lib/fieldLabelMap";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { exportToCSV, formatDateTimeForExport } from "@/lib/exportUtils";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobileCardActions, MobilePagination } from "@/components/ui/mobile-data-card";
import { notifyDataMutation } from "@/services/dataRefreshManager";

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
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get("tab") === "errors" ? "errors" : "logs";
  const [activeTab, setActiveTab] = useState(defaultTab);
  const useCompactLayout = isMobile || isTablet;
  const queryClient = useQueryClient();

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

  const { data: auditLogsPage, isLoading: loading } = useQuery({
    queryKey: ['operation-logs', currentPage, searchTerm, moduleFilter, operationFilter, operatorFilter, restoreStatusFilter, dateRange],
    queryFn: async () => {
      return fetchAuditLogsPage(currentPage, PAGE_SIZE, {
        module: moduleFilter,
        operationType: operationFilter,
        operatorAccount: operatorFilter,
        restoreStatus: restoreStatusFilter,
        searchTerm: searchTerm || undefined,
        dateRange: dateRange.start || dateRange.end ? { start: dateRange.start, end: dateRange.end } : undefined,
      });
    },
  });
  const isAdmin = () => {
    return userIsAdmin;
  };

  // Realtime subscription -> invalidate react-query cache
  useEffect(() => {
    const channel = supabase
      .channel('operation-logs-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'operation_logs' }, () => {
        queryClient.invalidateQueries({ queryKey: ['operation-logs'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

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
    toast.success(t("日志已刷新", "Logs refreshed"));
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
    ], '操作审计日志', false);
    toast.success(t("导出成功", "Export successful"));
  };

  const getDiffDisplay = (log: AuditLogEntry) => {
    return getObjectDiff(log.beforeData, log.afterData);
  };

  const handleRestore = async (log: AuditLogEntry) => {
    if (isRestoring) return; // 防重入
    
    if (!log.beforeData || !isRestorableModule(log.module)) {
      toast.error(t("此操作不支持恢复", "This operation cannot be restored"));
      return;
    }

    // 撤回操作不可恢复
    if ((log.objectDescription || '').includes('撤回')) {
      toast.error(t("撤回操作不可恢复", "Undo operations cannot be restored"));
      return;
    }

    if (!userIsAdmin) {
      toast.error(t("只有管理员可以执行恢复操作", "Only admins can perform restore operations"));
      return;
    }

    setIsRestoring(true);
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      
      // 根据模块执行恢复
      switch (log.module) {
        case 'member_management': {
          // 检查记录是否还存在
          const { data: currentMember, error: fetchError } = await supabase
            .from('members')
            .select('*')
            .eq('id', log.objectId)
            .maybeSingle();
          
          if (fetchError) throw fetchError;
          
          // 🔧 转换前端 camelCase 字段名到数据库 snake_case 字段名
          const mapMemberDataToDb = (data: any) => {
            if (!data) return data;
            const dbData: any = {};
            // 只映射 members 表实际存在的列
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
            // 记录不存在，需要重新插入
            const { error: insertError } = await supabase
              .from('members')
              .insert({ ...restoreData, id: log.objectId });
            
            if (insertError) throw insertError;
            
            logOperation('member_management', 'restore', log.objectId, null, log.beforeData,
              `恢复已删除的会员数据: ${log.objectDescription || log.objectId}`);
          } else {
            // 记录存在，更新数据
            const { error: updateError } = await supabase
              .from('members')
              .update(restoreData)
              .eq('id', log.objectId);
            
            if (updateError) throw updateError;
            
            logOperation('member_management', 'restore', log.objectId, currentMember, log.beforeData,
              `恢复会员数据: ${log.objectDescription || log.objectId}`);
          }
          break;
        }
        case 'employee_management': {
          const { data: currentEmployee, error: fetchError } = await supabase
            .from('employees')
            .select('id, username, real_name, role, status, visible')
            .eq('id', log.objectId)
            .maybeSingle();
          
          if (fetchError) throw fetchError;
          
          const restoreData = { ...log.beforeData };
          delete restoreData.password_hash;
          
          if (!currentEmployee) {
            // 记录不存在，需要重新插入
            const { error: insertError } = await supabase
              .from('employees')
              .insert({ ...restoreData, id: log.objectId });
            
            if (insertError) throw insertError;
            
            logOperation('employee_management', 'restore', log.objectId, null, restoreData,
              `恢复已删除的员工数据: ${log.objectDescription || log.objectId}`);
          } else {
            const { error: updateError } = await supabase
              .from('employees')
              .update(restoreData)
              .eq('id', log.objectId);
            
            if (updateError) throw updateError;
            
            logOperation('employee_management', 'restore', log.objectId, currentEmployee, restoreData,
              `恢复员工数据: ${log.objectDescription || log.objectId}`);
          }
          break;
        }
        case 'order_management': {
          // 导入积分恢复服务
          const { restorePointsOnOrderRestore } = await import('@/services/pointsService');
          const { normalizeCurrencyCode } = await import('@/config/currencies');
          
          // objectId可能是UUID或订单号，需要智能处理
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(log.objectId);
          const dbId = log.beforeData?.dbId || (isUuid ? log.objectId : null);
          
          if (!dbId) {
            // 尝试通过订单号查找
            const { data: orderByNumber, error: findError } = await supabase
              .from('orders')
              .select('*')
              .eq('order_number', log.objectId)
              .maybeSingle();
            
            if (findError || !orderByNumber) {
              throw new Error(`无法找到订单: ${log.objectId}`);
            }
            
            // 使用找到的UUID恢复
            const { error: updateError } = await supabase
              .from('orders')
              .update({ is_deleted: false, deleted_at: null, status: log.beforeData?.status || 'completed', points_status: 'added' })
              .eq('id', orderByNumber.id);
            
            if (updateError) throw updateError;
            
            // 恢复积分
            const currency = normalizeCurrencyCode(orderByNumber.currency);
            if (currency && orderByNumber.phone_number) {
              const memberCode = log.beforeData?.memberCode || orderByNumber.order_number;
              await restorePointsOnOrderRestore({
                orderId: orderByNumber.id,
                orderPhoneNumber: orderByNumber.phone_number,
                memberCode: memberCode,
                actualPayment: orderByNumber.actual_payment || 0,
                currency,
              });
            }
            
            logOperation('order_management', 'restore', orderByNumber.id, null, log.beforeData,
              `恢复已删除的订单数据: ${log.objectDescription || log.objectId}`);
            
            // 🔧 恢复订单后记录余额变动
            try {
              const { logOrderRestoreBalanceChange } = await import('@/services/balanceLogService');
              const { resolveVendorName, resolveProviderName } = await import('@/services/nameResolver');
              
              await logOrderRestoreBalanceChange({
                vendorName: resolveVendorName(orderByNumber.card_merchant_id),
                providerName: resolveProviderName(orderByNumber.vendor_id),
                cardWorth: Number(orderByNumber.amount) || 0,
                paymentValue: Number(orderByNumber.payment_value) || 0,
                currency: orderByNumber.currency || 'NGN',
                foreignRate: Number(orderByNumber.foreign_rate) || 0,
                orderId: orderByNumber.id,
                orderNumber: orderByNumber.order_number || log.objectId,
                orderCreatedAt: orderByNumber.created_at,
                operatorId: employee?.id,
                operatorName: employee?.real_name,
              });
            } catch (e) {
              console.error('[OperationLogs] Failed to log order restore balance change:', e);
            }
            
            queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
            queryClient.invalidateQueries({ queryKey: ['orders'] });
            queryClient.invalidateQueries({ queryKey: ['usdt-orders'] });
            queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
            queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
            notifyDataMutation({ table: 'orders', operation: 'UPDATE', source: 'manual' }).catch(console.error);
            notifyDataMutation({ table: 'points_ledger', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          } else {
            const { data: currentOrder, error: fetchError } = await supabase
              .from('orders')
              .select('*')
              .eq('id', dbId)
              .maybeSingle();
            
            if (fetchError) throw fetchError;
            
            if (!currentOrder) {
              // 订单已被物理删除，需要重新插入
              const insertData = { ...log.beforeData };
              delete insertData.dbId; // 移除前端专用字段
              
              const { error: insertError } = await supabase
                .from('orders')
                .insert({ ...insertData, id: dbId });
              
              if (insertError) throw insertError;
              
              // 恢复积分
              const currency = normalizeCurrencyCode(log.beforeData?.demandCurrency);
              if (currency && log.beforeData?.phoneNumber) {
                await restorePointsOnOrderRestore({
                  orderId: dbId,
                  orderPhoneNumber: log.beforeData.phoneNumber,
                  memberCode: log.beforeData.memberCode || '',
                  actualPayment: log.beforeData.actualPaid || 0,
                  currency,
                });
              }
              
              logOperation('order_management', 'restore', dbId, null, log.beforeData,
                `恢复已删除的订单数据: ${log.objectDescription || log.objectId}`);
              
              // 🔧 恢复订单后记录余额变动（物理删除恢复场景，使用 beforeData）
              try {
                const { logOrderRestoreBalanceChange } = await import('@/services/balanceLogService');
                const { resolveVendorName, resolveProviderName } = await import('@/services/nameResolver');
                
                await logOrderRestoreBalanceChange({
                  vendorName: resolveVendorName(log.beforeData?.vendor || log.beforeData?.card_merchant_id),
                  providerName: resolveProviderName(log.beforeData?.paymentProvider || log.beforeData?.vendor_id),
                  cardWorth: Number(log.beforeData?.cardWorth || log.beforeData?.amount) || 0,
                  paymentValue: Number(log.beforeData?.paymentValue || log.beforeData?.payment_value) || 0,
                  currency: log.beforeData?.demandCurrency || log.beforeData?.currency || 'NGN',
                  foreignRate: Number(log.beforeData?.foreignRate || log.beforeData?.foreign_rate) || 0,
                  orderId: dbId,
                  orderNumber: log.beforeData?.id || log.objectId,
                  orderCreatedAt: log.beforeData?.createdAt || log.beforeData?.created_at,
                  operatorId: employee?.id,
                  operatorName: employee?.real_name,
                });
              } catch (e) {
                console.error('[OperationLogs] Failed to log order restore balance change:', e);
              }
              
              queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
              queryClient.invalidateQueries({ queryKey: ['orders'] });
              queryClient.invalidateQueries({ queryKey: ['usdt-orders'] });
              queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
              queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
              notifyDataMutation({ table: 'orders', operation: 'UPDATE', source: 'manual' }).catch(console.error);
              notifyDataMutation({ table: 'points_ledger', operation: 'UPDATE', source: 'manual' }).catch(console.error);
            } else {
              // 软删除的订单，恢复标记
              const { error: updateError } = await supabase
                .from('orders')
                .update({ is_deleted: false, deleted_at: null, status: log.beforeData?.status || 'completed', points_status: 'added' })
                .eq('id', dbId);
              
              if (updateError) throw updateError;
              
              // 恢复积分
              const currency = normalizeCurrencyCode(currentOrder.currency);
              if (currency && currentOrder.phone_number) {
                const memberCode = log.beforeData?.memberCode || currentOrder.order_number;
                await restorePointsOnOrderRestore({
                  orderId: dbId,
                  orderPhoneNumber: currentOrder.phone_number,
                  memberCode: memberCode,
                  actualPayment: currentOrder.actual_payment || 0,
                  currency,
                });
              }
              
              logOperation('order_management', 'restore', dbId, currentOrder, log.beforeData,
                `恢复订单数据: ${log.objectDescription || log.objectId}`);
              
              // 🔧 恢复订单后记录余额变动
              try {
                const { logOrderRestoreBalanceChange } = await import('@/services/balanceLogService');
                const { resolveVendorName, resolveProviderName } = await import('@/services/nameResolver');
                
                const vendorName = resolveVendorName(currentOrder.card_merchant_id);
                const providerName = resolveProviderName(currentOrder.vendor_id);
                const cardWorth = Number(currentOrder.amount) || 0;
                const paymentValue = Number(currentOrder.payment_value) || 0;
                
                await logOrderRestoreBalanceChange({
                  vendorName,
                  providerName,
                  cardWorth,
                  paymentValue,
                  currency: currentOrder.currency || 'NGN',
                  foreignRate: Number(currentOrder.foreign_rate) || 0,
                  orderId: dbId,
                  orderNumber: currentOrder.order_number || log.objectId,
                  orderCreatedAt: currentOrder.created_at,
                  operatorId: employee?.id,
                  operatorName: employee?.real_name,
                });
              } catch (e) {
              console.error('[OperationLogs] Failed to log order restore balance change:', e);
            }
              
              queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
              queryClient.invalidateQueries({ queryKey: ['orders'] });
              queryClient.invalidateQueries({ queryKey: ['usdt-orders'] });
              queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
              queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
              notifyDataMutation({ table: 'orders', operation: 'UPDATE', source: 'manual' }).catch(console.error);
              notifyDataMutation({ table: 'points_ledger', operation: 'UPDATE', source: 'manual' }).catch(console.error);
            }
          }
          break;
        }
        case 'activity_gift': {
          const { data: currentGift, error: fetchError } = await supabase
            .from('activity_gifts')
            .select('*')
            .eq('id', log.objectId)
            .maybeSingle();
          
          if (fetchError) throw fetchError;
          
          if (!currentGift) {
            // 活动赠送已被删除，需要重新插入
            const giftData = log.beforeData;
            const { error: insertError } = await supabase
              .from('activity_gifts')
              .insert({ ...giftData, id: log.objectId });
            
            if (insertError) throw insertError;
            
            // ============= 恢复活动赠送时重新扣除积分并加回赠送金额 =============
            // 活动赠送代表积分兑换礼品，删除时积分已被退回、member_activity 赠送金额已回收
            // 恢复时需要：1) 重新扣除积分 2) 加回 member_activity 的赠送奈拉/赛地/USDT
            const phoneNumber = giftData.phone_number;
            const hasGiftValue = (giftData.gift_value ?? 0) > 0;
            if (phoneNumber && hasGiftValue) {
              // 获取会员信息 - member_id 为空时按 phone_number 查找
              let member: { member_code: string; phone_number: string; id: string } | null = null;
              if (giftData.member_id) {
                const { data } = await supabase
                  .from('members')
                  .select('id, member_code, phone_number')
                  .eq('id', giftData.member_id)
                  .maybeSingle();
                member = data;
              }
              if (!member && phoneNumber) {
                const { data } = await supabase
                  .from('members')
                  .select('id, member_code, phone_number')
                  .eq('phone_number', phoneNumber)
                  .maybeSingle();
                member = data;
              }
              
              if (member) {
                // 确定兑换类型
                const transactionType = giftData.gift_type === 'activity_1' 
                  ? 'redeem_activity_1' 
                  : 'redeem_activity_2';
                
                const pointsToDeduct = Math.round(giftData.gift_value || 0);
                
                if (pointsToDeduct > 0) {
                  // 插入负积分记录
                  const { error: ledgerError } = await supabase
                    .from('points_ledger')
                    .insert({
                      member_code: member.member_code,
                      member_id: member.id,
                      phone_number: member.phone_number,
                      points_earned: -pointsToDeduct,
                      transaction_type: transactionType,
                      status: 'issued',
                      currency: giftData.currency || null,
                      creator_id: employee?.id || null,
                      creator_name: employee?.real_name || 'system',
                    });
                  
                  if (ledgerError) {
                    console.error('Failed to create points deduction on gift restore:', ledgerError);
                  } else {
                    console.log(`[ActivityGift] Restored gift, deducted ${pointsToDeduct} points from member ${member.member_code}`);
                  }
                }
              }
              
              // 更新 member_activity 中的赠送金额（赠送奈拉/赛地/USDT）- 支持 member_id 或 phone_number
              const activityQuery = member
                ? supabase.from('member_activity').select('total_gift_ngn, total_gift_ghs, total_gift_usdt').eq('member_id', member.id)
                : supabase.from('member_activity').select('total_gift_ngn, total_gift_ghs, total_gift_usdt').eq('phone_number', phoneNumber);
              const { data: currentActivity } = await activityQuery.maybeSingle();
              
              if (currentActivity) {
                const currency = (giftData.currency || 'USDT').toUpperCase();
                const updateData: Record<string, any> = {
                  updated_at: new Date().toISOString(),
                };
                if (currency === 'NGN') {
                  updateData.total_gift_ngn = (currentActivity.total_gift_ngn || 0) + (giftData.amount || 0);
                } else if (currency === 'GHS') {
                  updateData.total_gift_ghs = (currentActivity.total_gift_ghs || 0) + (giftData.amount || 0);
                } else {
                  updateData.total_gift_usdt = (currentActivity.total_gift_usdt || 0) + (giftData.amount || 0);
                }
                const updateQuery = member
                  ? supabase.from('member_activity').update(updateData).eq('member_id', member.id)
                  : supabase.from('member_activity').update(updateData).eq('phone_number', phoneNumber);
                await updateQuery;
              }
            }
            
            logOperation('activity_gift', 'restore', log.objectId, null, log.beforeData,
              `恢复已删除的活动赠送数据: ${log.objectDescription || log.objectId}`);
            
            // 🔧 修复：恢复赠送时记录余额变动明细
            try {
              const { logGiftRestoreBalanceChange } = await import('@/services/balanceLogService');
              const giftData = log.beforeData;
              if (giftData?.payment_agent && (giftData?.gift_value ?? 0) > 0) {
                await logGiftRestoreBalanceChange({
                  providerName: giftData.payment_agent,
                  giftValue: giftData.gift_value,
                  giftId: log.objectId || '',
                  giftCreatedAt: giftData.created_at,
                  phoneNumber: giftData.phone_number,
                  operatorId: employee?.id,
                  operatorName: employee?.real_name,
                });
              }
            } catch (e) {
              console.error('[OperationLogs] Failed to log gift restore balance change:', e);
            }
            
            // 触发统一数据刷新（活动赠送与积分）
            notifyDataMutation({ table: 'activity_gifts', operation: 'UPDATE', source: 'manual' }).catch(console.error);
            notifyDataMutation({ table: 'points_ledger', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          } else {
            // 编辑恢复场景：记录存在，恢复到之前的状态
            const { error: updateError } = await supabase
              .from('activity_gifts')
              .update(log.beforeData)
              .eq('id', log.objectId);
            
            if (updateError) throw updateError;
            
            // 🔧 修复：恢复赠送编辑时需要调整余额
            try {
              const currentGiftValue = safeNumber(currentGift.gift_value);
              const restoreGiftValue = safeNumber(log.beforeData?.gift_value);
              const currentAgent = currentGift.payment_agent;
              const restoreAgent = log.beforeData?.payment_agent;
              const giftCreatedAt = currentGift.created_at || log.beforeData?.created_at;
              
              if (currentAgent !== restoreAgent) {
                // 代付商家变更：旧商家恢复余额，新商家扣减余额
                const { logGiftDeleteBalanceChange, logGiftRestoreBalanceChange } = await import('@/services/balanceLogService');
                if (currentAgent && currentGiftValue > 0) {
                  await logGiftDeleteBalanceChange({
                    providerName: currentAgent,
                    giftValue: currentGiftValue,
                    giftId: log.objectId || '',
                    giftCreatedAt,
                    operatorId: employee?.id,
                    operatorName: employee?.real_name,
                  });
                }
                if (restoreAgent && restoreGiftValue > 0) {
                  await logGiftRestoreBalanceChange({
                    providerName: restoreAgent,
                    giftValue: restoreGiftValue,
                    giftId: log.objectId || '',
                    giftCreatedAt,
                    phoneNumber: log.beforeData?.phone_number,
                    operatorId: employee?.id,
                    operatorName: employee?.real_name,
                  });
                }
              } else if (currentGiftValue !== restoreGiftValue && currentAgent) {
                // 同商家，金额变化：记录差额调整
                const { logGiftUpdateBalanceChange } = await import('@/services/balanceLogService');
                await logGiftUpdateBalanceChange({
                  providerName: currentAgent,
                  oldGiftValue: currentGiftValue,
                  newGiftValue: restoreGiftValue,
                  giftId: log.objectId || '',
                  giftCreatedAt,
                  operatorId: employee?.id,
                  operatorName: employee?.real_name,
                });
              }
            } catch (e) {
              console.error('[OperationLogs] Failed to log gift restore balance change:', e);
            }
            
            logOperation('activity_gift', 'restore', log.objectId, currentGift, log.beforeData,
              `恢复活动赠送数据: ${log.objectDescription || log.objectId}`);
            
            // 触发统一数据刷新（活动赠送）
            notifyDataMutation({ table: 'activity_gifts', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          }
          break;
        }
        case 'card_management': {
          // 恢复卡片数据
          const { data: currentCard, error: fetchError } = await supabase
            .from('cards')
            .select('*')
            .eq('id', log.objectId)
            .maybeSingle();
          
          if (fetchError) throw fetchError;
          
          if (!currentCard) {
            // 卡片已被删除，重新插入
            const cardData = log.beforeData;
            const { error: insertError } = await supabase
              .from('cards')
              .insert({
                id: log.objectId,
                name: cardData.name,
                type: cardData.type || 'default',
                status: cardData.status || 'active',
                remark: cardData.remark || '',
                card_vendors: cardData.cardVendors || [],
                sort_order: cardData.sortOrder || 0,
              });
            
            if (insertError) throw insertError;
            
            logOperation('card_management', 'restore', log.objectId, null, log.beforeData,
              `恢复已删除的卡片: ${log.objectDescription || cardData.name}`);
          } else {
            // 卡片存在，更新数据
            const { error: updateError } = await supabase
              .from('cards')
              .update({
                name: log.beforeData.name,
                type: log.beforeData.type,
                status: log.beforeData.status,
                remark: log.beforeData.remark,
                card_vendors: log.beforeData.cardVendors,
                sort_order: log.beforeData.sortOrder,
              })
              .eq('id', log.objectId);
            
            if (updateError) throw updateError;
            
            logOperation('card_management', 'restore', log.objectId, currentCard, log.beforeData,
              `恢复卡片数据: ${log.objectDescription || log.objectId}`);
          }
          break;
        }
        case 'vendor_management': {
          // 恢复卡商数据
          const { data: currentVendor, error: fetchError } = await supabase
            .from('vendors')
            .select('*')
            .eq('id', log.objectId)
            .maybeSingle();
          
          if (fetchError) throw fetchError;
          
          if (!currentVendor) {
            // 卡商已被删除，重新插入
            const vendorData = log.beforeData;
            const { error: insertError } = await supabase
              .from('vendors')
              .insert({
                id: log.objectId,
                name: vendorData.name,
                status: vendorData.status || 'active',
                remark: vendorData.remark || '',
                payment_providers: vendorData.paymentProviders || [],
                sort_order: vendorData.sortOrder || 0,
              });
            
            if (insertError) throw insertError;
            
            logOperation('vendor_management', 'restore', log.objectId, null, log.beforeData,
              `恢复已删除的卡商: ${log.objectDescription || vendorData.name}`);
          } else {
            const { error: updateError } = await supabase
              .from('vendors')
              .update({
                name: log.beforeData.name,
                status: log.beforeData.status,
                remark: log.beforeData.remark,
                payment_providers: log.beforeData.paymentProviders,
                sort_order: log.beforeData.sortOrder,
              })
              .eq('id', log.objectId);
            
            if (updateError) throw updateError;
            
            logOperation('vendor_management', 'restore', log.objectId, currentVendor, log.beforeData,
              `恢复卡商数据: ${log.objectDescription || log.objectId}`);
          }
          break;
        }
        case 'provider_management': {
          // 恢复代付商家数据
          const { data: currentProvider, error: fetchError } = await supabase
            .from('payment_providers')
            .select('*')
            .eq('id', log.objectId)
            .maybeSingle();
          
          if (fetchError) throw fetchError;
          
          if (!currentProvider) {
            // 代付商家已被删除，重新插入
            const providerData = log.beforeData;
            const { error: insertError } = await supabase
              .from('payment_providers')
              .insert({
                id: log.objectId,
                name: providerData.name,
                status: providerData.status || 'active',
                remark: providerData.remark || '',
                sort_order: providerData.sortOrder || 0,
              });
            
            if (insertError) throw insertError;
            
            logOperation('provider_management', 'restore', log.objectId, null, log.beforeData,
              `恢复已删除的代付商家: ${log.objectDescription || providerData.name}`);
          } else {
            const { error: updateError } = await supabase
              .from('payment_providers')
              .update({
                name: log.beforeData.name,
                status: log.beforeData.status,
                remark: log.beforeData.remark,
                sort_order: log.beforeData.sortOrder,
              })
              .eq('id', log.objectId);
            
            if (updateError) throw updateError;
            
            logOperation('provider_management', 'restore', log.objectId, currentProvider, log.beforeData,
              `恢复代付商家数据: ${log.objectDescription || log.objectId}`);
          }
          break;
        }
        case 'activity_type': {
          // 恢复活动类型
          const { data: currentType, error: fetchError } = await supabase
            .from('activity_types')
            .select('*')
            .eq('id', log.objectId)
            .maybeSingle();
          
          if (fetchError) throw fetchError;
          
          if (!currentType) {
            const typeData = log.beforeData;
            const { error: insertError } = await supabase
              .from('activity_types')
              .insert({
                id: log.objectId,
                value: typeData.value,
                label: typeData.label,
                is_active: typeData.isActive !== false,
                sort_order: typeData.sortOrder || 0,
              });
            
            if (insertError) throw insertError;
            
            logOperation('activity_type', 'restore', log.objectId, null, log.beforeData,
              `恢复已删除的活动类型: ${log.objectDescription || typeData.label}`);
          } else {
            const { error: updateError } = await supabase
              .from('activity_types')
              .update({
                value: log.beforeData.value,
                label: log.beforeData.label,
                is_active: log.beforeData.isActive,
                sort_order: log.beforeData.sortOrder,
              })
              .eq('id', log.objectId);
            
            if (updateError) throw updateError;
            
            logOperation('activity_type', 'restore', log.objectId, currentType, log.beforeData,
              `恢复活动类型数据: ${log.objectDescription || log.objectId}`);
          }
          break;
        }
        case 'currency_settings': {
          // 恢复币种设置
          const { data: currentCurrency, error: fetchError } = await supabase
            .from('currencies')
            .select('*')
            .eq('id', log.objectId)
            .maybeSingle();
          
          if (fetchError) throw fetchError;
          
          if (!currentCurrency) {
            const currencyData = log.beforeData;
            const { error: insertError } = await supabase
              .from('currencies')
              .insert({
                id: log.objectId,
                code: currencyData.code,
                name_en: currencyData.name_en || currencyData.code,
                name_zh: currencyData.name_zh,
                badge_color: currencyData.badge_color || 'bg-gray-100 text-gray-700 border-gray-200',
                sort_order: currencyData.sort_order || 0,
                is_active: currencyData.is_active !== false,
              });
            
            if (insertError) throw insertError;
            
            logOperation('currency_settings', 'restore', log.objectId, null, log.beforeData,
              `恢复已删除的币种: ${log.objectDescription || currencyData.code}`);
          } else {
            const { error: updateError } = await supabase
              .from('currencies')
              .update({
                code: log.beforeData.code,
                name_zh: log.beforeData.name_zh,
                badge_color: log.beforeData.badge_color,
                sort_order: log.beforeData.sort_order,
                is_active: log.beforeData.is_active,
              })
              .eq('id', log.objectId);
            
            if (updateError) throw updateError;
            
            logOperation('currency_settings', 'restore', log.objectId, currentCurrency, log.beforeData,
              `恢复币种数据: ${log.objectDescription || log.objectId}`);
          }
          break;
        }
        case 'customer_source': {
          // 恢复客户来源
          const { data: currentSource, error: fetchError } = await supabase
            .from('customer_sources')
            .select('*')
            .eq('id', log.objectId)
            .maybeSingle();
          
          if (fetchError) throw fetchError;
          
          if (!currentSource) {
            const sourceData = log.beforeData;
            const { error: insertError } = await supabase
              .from('customer_sources')
              .insert({
                id: log.objectId,
                name: sourceData.name,
                sort_order: sourceData.sortOrder || 0,
                is_active: sourceData.isActive !== false,
              });
            
            if (insertError) throw insertError;
            
            logOperation('customer_source', 'restore', log.objectId, null, log.beforeData,
              `恢复已删除的客户来源: ${log.objectDescription || sourceData.name}`);
          } else {
            const { error: updateError } = await supabase
              .from('customer_sources')
              .update({
                name: log.beforeData.name,
                sort_order: log.beforeData.sortOrder,
                is_active: log.beforeData.isActive,
              })
              .eq('id', log.objectId);
            
            if (updateError) throw updateError;
            
            logOperation('customer_source', 'restore', log.objectId, currentSource, log.beforeData,
              `恢复客户来源数据: ${log.objectDescription || log.objectId}`);
          }
          break;
        }
        case 'referral': {
          // 恢复推荐关系
          const { data: currentRelation, error: fetchError } = await supabase
            .from('referral_relations')
            .select('*')
            .eq('id', log.objectId)
            .maybeSingle();
          
          if (fetchError) throw fetchError;
          
          if (!currentRelation) {
            const relationData = log.beforeData;
            const { error: insertError } = await supabase
              .from('referral_relations')
              .insert({
                id: log.objectId,
                referrer_phone: relationData.referrerPhone,
                referrer_member_code: relationData.referrerMemberCode,
                referee_phone: relationData.refereePhone,
                referee_member_code: relationData.refereeMemberCode,
                source: relationData.source || '转介绍',
              });
            
            if (insertError) throw insertError;
            
            logOperation('referral', 'restore', log.objectId, null, log.beforeData,
              `恢复已删除的推荐关系: ${log.objectDescription || `${relationData.referrerPhone} -> ${relationData.refereePhone}`}`);
          } else {
            const { error: updateError } = await supabase
              .from('referral_relations')
              .update({
                referrer_phone: log.beforeData.referrerPhone,
                referrer_member_code: log.beforeData.referrerMemberCode,
                referee_phone: log.beforeData.refereePhone,
                referee_member_code: log.beforeData.refereeMemberCode,
                source: log.beforeData.source,
              })
              .eq('id', log.objectId);
            
            if (updateError) throw updateError;
            
            logOperation('referral', 'restore', log.objectId, currentRelation, log.beforeData,
              `恢复推荐关系数据: ${log.objectDescription || log.objectId}`);
          }
          break;
        }
        case 'system_settings': {
          const { saveSharedData, loadSharedData } = await import('@/services/sharedDataService');
          const currentData = await loadSharedData(log.objectId as any);
          await saveSharedData(log.objectId as any, log.beforeData);
          
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
          const { createLedgerEntry } = await import('@/services/ledgerTransactionService');
          
          const beforeData = log.beforeData;
          if (!beforeData) {
            toast.error(t('无法恢复：缺少原始数据', 'Cannot restore: missing original data'));
            return;
          }
          
          // Determine if this is a withdrawal (WD_) or recharge (RC_) by objectId
          const objectId = log.objectId;
          const description = log.objectDescription || '';
          
          if (objectId.startsWith('WD_')) {
            // Extract vendor name from description: "删除卡商提款: VendorName"
            const vendorMatch = description.match(/[:：]\s*(.+?)(?:\s*-|$)/);
            const vendorName = vendorMatch?.[1]?.trim() || beforeData.vendorName || '';
            
            if (!vendorName) {
              toast.error(t('无法恢复：无法确定卡商名称', 'Cannot restore: vendor name not found'));
              return;
            }
            
            // Re-add the withdrawal
            const settlements = await getCardMerchantSettlementsAsync();
            let settlement = settlements.find(s => s.vendorName === vendorName);
            
            if (settlement) {
              // Check if already exists
              const exists = settlement.withdrawals.some(w => w.id === objectId);
              if (exists) {
                toast.error(t('该提款记录已存在，无需恢复', 'Withdrawal record already exists'));
                return;
              }
              
              // Restore the record
              settlement.withdrawals.push(beforeData);
              const { saveSharedData } = await import('@/services/sharedDataService');
              await saveSharedData('cardMerchantSettlements', settlements);
              
              // Re-create ledger entry
              await createLedgerEntry({
                accountType: 'card_vendor',
                accountId: vendorName,
                sourceType: 'withdrawal_restore',
                sourceId: `wdrestore_${objectId}_${Date.now()}`,
                amount: -beforeData.settlementTotal,
                note: `恢复提款: ${beforeData.withdrawalAmountUsdt} USDT × ${beforeData.usdtRate} = ¥${beforeData.settlementTotal}`,
                operatorId: employee?.id,
                operatorName: employee?.real_name,
              });
            }
            
            logOperation('merchant_settlement', 'restore', objectId, null, beforeData,
              `恢复已删除的卡商提款: ${vendorName} - ¥${beforeData.settlementTotal}`);
            
            notifyDataMutation({ table: 'ledger_transactions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          } else if (objectId.startsWith('RC_')) {
            // Extract provider name from description: "删除代付商家充值: ProviderName"
            const providerMatch = description.match(/[:：]\s*(.+?)(?:\s*-|$)/);
            const providerName = providerMatch?.[1]?.trim() || beforeData.providerName || '';
            
            if (!providerName) {
              toast.error(t('无法恢复：无法确定代付商家名称', 'Cannot restore: provider name not found'));
              return;
            }
            
            // Re-add the recharge
            const settlements = await getPaymentProviderSettlementsAsync();
            let settlement = settlements.find(s => s.providerName === providerName);
            
            if (settlement) {
              const exists = settlement.recharges.some(r => r.id === objectId);
              if (exists) {
                toast.error(t('该充值记录已存在，无需恢复', 'Recharge record already exists'));
                return;
              }
              
              settlement.recharges.push(beforeData);
              const { saveSharedData } = await import('@/services/sharedDataService');
              await saveSharedData('paymentProviderSettlements', settlements);
              
              await createLedgerEntry({
                accountType: 'payment_provider',
                accountId: providerName,
                sourceType: 'recharge_restore',
                sourceId: `rcrestore_${objectId}_${Date.now()}`,
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
            const { saveSharedData } = await import('@/services/sharedDataService');
            const { createLedgerEntry, createAdjustmentEntry, setInitialBalanceLedger } = await import('@/services/ledgerTransactionService');
            
            // Determine if this is a card vendor or payment provider operation
            const isProviderOp = description.includes('代付') || description.includes('充值');
            const isVendorOp = description.includes('卡商') || description.includes('提款');
            
            if (isVendorOp || (!isProviderOp && beforeData.vendorName)) {
              // Card vendor settlement restore
              const vendorName = beforeData.vendorName || objectId;
              const settlements = await getCardMerchantSettlementsAsync();
              const idx = settlements.findIndex(s => s.vendorName === vendorName);
              const { reverseAllEntriesForSource } = await import('@/services/ledgerTransactionService');
              
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
              const providerName = beforeData.providerName || objectId;
              const settlements = await getPaymentProviderSettlementsAsync();
              const idx = settlements.findIndex(s => s.providerName === providerName);
              const { reverseAllEntriesForSource } = await import('@/services/ledgerTransactionService');
              
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
              toast.error(t('此类型的商家结算操作暂不支持恢复', 'This type of settlement operation cannot be restored'));
              return;
            }
          }
          break;
        }
        default:
          toast.error(t("此模块不支持恢复", "This module does not support restore"));
          return;
      }

      await markLogAsRestored(log.id, employee?.id);
      const { refreshAuditLogCache: refresh } = await import('@/stores/auditLogStore');
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ['operation-logs'] });
      toast.success(t("数据已恢复，并生成了恢复操作日志", "Data restored and logged"));
      setRestoreConfirm(null);
    } catch (error: any) {
      console.error('恢复失败:', error);
      toast.error(t(`恢复失败: ${error?.message || '未知错误'}`, `Restore failed: ${error?.message || 'Unknown error'}`));
    } finally {
      setIsRestoring(false);
    }
  };

  const getOperationBadge = (type: OperationType) => {
    const colors: Record<OperationType, string> = {
      create: "bg-green-500",
      update: "bg-blue-500",
      cancel: "bg-yellow-500",
      restore: "bg-cyan-500",
      delete: "bg-red-500",
      audit: "bg-orange-500",
      reject: "bg-rose-500",
      status_change: "bg-purple-500",
    };
    return <Badge className={colors[type]}>{getOperationName(type, language as 'zh' | 'en')}</Badge>;
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
    const isUndoOperation = (log.objectDescription || '').includes('撤回');
    return isAdmin() && log.beforeData && isRestorableModule(log.module) && !log.isRestored && log.operationType !== 'restore' && !isUndoOperation;
  };

  // 可批量恢复的日志
  const restorableLogs = useMemo(() => {
    return filteredLogs.filter(log => canRestore(log));
  }, [filteredLogs]);

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
      toast.success(t(`批量恢复完成: ${successCount} 条成功${failCount > 0 ? `, ${failCount} 条失败` : ''}`, `Batch restore done: ${successCount} succeeded${failCount > 0 ? `, ${failCount} failed` : ''}`));
    } else if (failCount > 0) {
      toast.error(t(`批量恢复失败: ${failCount} 条记录恢复失败`, `Batch restore failed: ${failCount} records failed`));
    }
    
    const { refreshAuditLogCache: refresh2 } = await import('@/stores/auditLogStore');
    await refresh2();
    await queryClient.invalidateQueries({ queryKey: ['operation-logs'] });
  };

  const formatValue = (value: any, fieldKey?: string): string => {
    if (fieldKey) return formatLogFieldValue(fieldKey, value, language as 'zh' | 'en');
    return formatDisplayValue(value, language as 'zh' | 'en');
  };

  // 过滤隐藏字段
  const filterHiddenFields = (data: any): [string, any][] => {
    if (!data || typeof data !== 'object') return [];
    return Object.entries(data).filter(([key]) => !HIDDEN_LOG_FIELDS.has(key));
  };

  if (loading) {
    return <TablePageSkeleton />;
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
        <TabsList className="shrink-0 w-fit">
          <TabsTrigger value="logs">{t("操作日志", "Operation Logs")}</TabsTrigger>
          <TabsTrigger value="errors">{t("异常报告", "Error Reports")}</TabsTrigger>
        </TabsList>

        <TabsContent value="errors" className="flex-1 mt-4">
          <Suspense fallback={<TablePageSkeleton />}>
            <ErrorReportsPanel />
          </Suspense>
        </TabsContent>

        <TabsContent value="logs" className="flex-1 flex flex-col gap-4 mt-0">
      {/* Header - now combined into filter area */}

      {/* 高级筛选区 */}
      <Card className="p-3 sm:p-4 shrink-0">
        <div className="space-y-3">
          {/* 日期筛选 + 刷新/导出 */}
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
                {!isMobile && <span className="ml-1">{t("刷新", "Refresh")}</span>}
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport}>
                <Download className="h-4 w-4" />
                {!isMobile && <span className="ml-1">{t("导出", "Export")}</span>}
              </Button>
            </div>
          </div>

          {/* 搜索和多条件筛选 */}
          <div className={isMobile ? "space-y-2" : "flex flex-wrap items-center gap-2"}>
            <div className={isMobile ? "relative w-full" : "relative flex-1 min-w-[200px] max-w-sm"}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("搜索操作人、对象ID、描述...", "Search operator, object, desc...")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <div className={isMobile ? "grid grid-cols-2 gap-2" : "flex flex-wrap items-center gap-2"}>
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger className={isMobile ? "h-9" : "w-28 h-9"}>
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
                <SelectTrigger className={isMobile ? "h-9" : "w-24 h-9"}>
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
                <SelectTrigger className={isMobile ? "h-9" : "w-28 h-9"}>
                  <SelectValue placeholder={t("操作人", "Operator")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("全部操作人", "All Operators")}</SelectItem>
                  {Array.from(new Set(filteredLogs.map(log => log.operatorAccount))).map((account) => (
                    <SelectItem key={account} value={account}>{account}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={restoreStatusFilter} onValueChange={setRestoreStatusFilter}>
                <SelectTrigger className={isMobile ? "h-9" : "w-28 h-9"}>
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
          <div className={isMobile ? "space-y-2" : "flex items-center justify-between"}>
            <div className="flex items-center gap-2 flex-wrap">
              <Shield className="h-5 w-5 text-primary" />
              <h1 className="text-base sm:text-lg font-semibold text-foreground">{t("操作日志", "Operation Logs")}</h1>
              <Badge variant="outline" className="text-xs gap-1">
                <Lock className="h-3 w-3" />
                {t("只读", "Read-only")}
              </Badge>
              <span className="text-xs sm:text-sm text-muted-foreground">
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
              {!isMobile && (
                <span className="text-sm font-normal text-muted-foreground">
                  {t("数据只允许追加，不允许修改或删除", "Data can only be appended, not modified or deleted")}
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {useCompactLayout ? (
            <MobileCardList>
              {paginatedLogs.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">{t("暂无审计日志记录", "No audit logs found")}</p>
              ) : paginatedLogs.map((log) => (
                <MobileCard key={log.id} className={log.isRestored ? 'opacity-50' : ''}>
                  <MobileCardHeader>
                    <span className="font-medium text-sm">{log.operatorAccount}</span>
                    <div className="flex items-center gap-1">
                      {getOperationBadge(log.operationType)}
                      {log.isRestored && <Badge variant="outline" className="text-xs">{t("已恢复", "Restored")}</Badge>}
                    </div>
                  </MobileCardHeader>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(log.timestamp).toLocaleString('zh-CN', {
                      year: 'numeric', month: '2-digit', day: '2-digit',
                      hour: '2-digit', minute: '2-digit', second: '2-digit',
                    })}
                  </div>
                  <MobileCardRow label={t("模块", "Module")} value={getModuleName(log.module, language as 'zh' | 'en')} />
                  <MobileCardRow label={t("对象", "Object")} value={getReadableObjectId(log)} />
                  <MobileCardRow label={t("角色", "Role")} value={formatLogFieldValue('role', log.operatorRole, language as 'zh' | 'en')} />
                  <MobileCardCollapsible>
                    <MobileCardRow label="IP" value={log.ipAddress} />
                    {log.objectDescription && <MobileCardRow label={t("描述", "Desc")} value={cleanDescription(log.objectDescription)} />}
                  </MobileCardCollapsible>
                  <MobileCardActions>
                    <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => setViewingLog(log)}>
                      <Eye className="h-3 w-3 mr-1" />{t("详情", "Details")}
                    </Button>
                    {canRestore(log) && (
                      <Button size="sm" variant="outline" className="flex-1 h-8 text-amber-600" onClick={() => setRestoreConfirm(log)}>
                        <RotateCcw className="h-3 w-3 mr-1" />{t("恢复", "Restore")}
                      </Button>
                    )}
                  </MobileCardActions>
                </MobileCard>
              ))}
              <MobilePagination currentPage={currentPage} totalPages={totalPages} totalItems={totalCount} onPageChange={setCurrentPage} pageSize={PAGE_SIZE} />
            </MobileCardList>
          ) : (
          <>
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
                      {new Date(log.timestamp).toLocaleString('zh-CN', {
                        year: 'numeric', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit', second: '2-digit',
                      })}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-1.5">{log.operatorAccount}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap px-1.5">{formatLogFieldValue('role', log.operatorRole, language as 'zh' | 'en')}</TableCell>
                    <TableCell className="whitespace-nowrap px-1.5">{getModuleName(log.module, language as 'zh' | 'en')}</TableCell>
                    <TableCell className="max-w-[160px] truncate px-1.5" title={log.objectDescription || log.objectId}>
                      {getReadableObjectId(log)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-1.5">
                      {getOperationBadge(log.operationType)}
                      {log.isRestored && <Badge variant="outline" className="ml-1 text-xs">{t("已恢复", "Restored")}</Badge>}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap px-1.5">{log.ipAddress}</TableCell>
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
          </>
          )}
        </CardContent>
      </Card>

      {/* View Details Dialog */}
      <Dialog open={!!viewingLog} onOpenChange={(open) => !open && setViewingLog(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {t("操作详情", "Operation Details")}
            </DialogTitle>
          </DialogHeader>
          {viewingLog && (
            <ScrollArea className="max-h-[70vh]">
              <div className="space-y-6 pr-4">
                <div className={isMobile ? "grid grid-cols-2 gap-3" : "grid grid-cols-4 gap-4"}>
                  <div>
                    <Label className="text-muted-foreground">{t("操作时间", "Time")}</Label>
                    <p className="font-mono text-sm">{new Date(viewingLog.timestamp).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">{t("操作人账号", "Operator")}</Label>
                    <p>{viewingLog.operatorAccount}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">{t("操作人角色", "Role")}</Label>
                    <p>{formatLogFieldValue('role', viewingLog.operatorRole, language as 'zh' | 'en')}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">{t("操作IP", "IP Address")}</Label>
                    <p className="font-mono text-sm">{viewingLog.ipAddress}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">{t("操作模块", "Module")}</Label>
                    <p>{getModuleName(viewingLog.module, language as 'zh' | 'en')}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">{t("操作类型", "Type")}</Label>
                    <div>{getOperationBadge(viewingLog.operationType)}</div>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-muted-foreground">{t("操作对象", "Object")}</Label>
                    <p className="text-sm">{getReadableObjectId(viewingLog)}</p>
                  </div>
                </div>

                {viewingLog.objectDescription && (
                  <div>
                    <Label className="text-muted-foreground">{t("操作描述", "Description")}</Label>
                    <p>{cleanDescription(viewingLog.objectDescription)}</p>
                  </div>
                )}

                {(viewingLog.beforeData || viewingLog.afterData) && (
                  <div className="space-y-4">
                    <Label className="text-lg font-semibold">{t("数据变更对比", "Data Change Comparison")}</Label>
                    {getDiffDisplay(viewingLog).length > 0 && (
                      <div className="rounded-lg border p-4 bg-muted/30">
                        <Label className="text-sm text-muted-foreground mb-2 block">{t("变更字段高亮", "Changed Fields")}</Label>
                        <div className="space-y-2">
                          {getDiffDisplay(viewingLog)
                            .filter(diff => !HIDDEN_LOG_FIELDS.has(diff.key))
                            .map((diff, index) => (
                            <div key={index} className="flex items-start gap-4 text-sm">
                              <span className="font-medium min-w-[140px] text-foreground">{translateFieldName(diff.key, language as 'zh' | 'en')}:</span>
                              <div className="flex-1 flex gap-4">
                                <div className="flex-1">
                                  <span className="text-xs text-muted-foreground block">{t("修改前", "Before")}</span>
                                  <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-2 py-0.5 rounded block mt-1 text-xs break-all">
                                    {formatValue(diff.before, diff.key)}
                                  </span>
                                </div>
                                <div className="flex-1">
                                  <span className="text-xs text-muted-foreground block">{t("修改后", "After")}</span>
                                  <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-0.5 rounded block mt-1 text-xs break-all">
                                    {formatValue(diff.after, diff.key)}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button onClick={() => setViewingLog(null)}>{t("关闭", "Close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Confirmation with Preview */}
      <Dialog open={!!restoreConfirm} onOpenChange={(open) => !open && setRestoreConfirm(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-amber-600" />
              {t("确认恢复数据", "Confirm Data Restore")}
            </DialogTitle>
          </DialogHeader>
          {restoreConfirm && (
            <ScrollArea className="max-h-[50vh]">
              <div className="space-y-4 pr-4">
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                  <p className="text-sm text-amber-800 dark:text-amber-200">
                    {t("此操作将把数据恢复到修改前的状态。恢复操作本身也会被记录在审计日志中。", "This will restore data to its previous state. The restore action will also be logged.")}
                  </p>
                </div>
                
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <Label className="text-muted-foreground text-xs">{t("操作模块", "Module")}</Label>
                    <p className="font-medium">{getModuleName(restoreConfirm.module, language as 'zh' | 'en')}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">{t("操作类型", "Type")}</Label>
                    <div>{getOperationBadge(restoreConfirm.operationType)}</div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">{t("对象", "Object")}</Label>
                    <p className="text-xs truncate" title={restoreConfirm.objectId}>{getReadableObjectId(restoreConfirm)}</p>
                  </div>
                </div>

                {restoreConfirm.objectDescription && (
                  <div>
                    <Label className="text-muted-foreground text-xs">{t("描述", "Description")}</Label>
                    <p className="text-sm">{cleanDescription(restoreConfirm.objectDescription)}</p>
                  </div>
                )}

                {restoreConfirm.beforeData && (
                  <div>
                    <Label className="text-sm font-medium text-green-700 dark:text-green-400 mb-2 block">
                      {t("将要恢复的数据 (恢复前状态)", "Data to Restore (Previous State)")}
                    </Label>
                    <div className="rounded-lg border bg-green-50/50 dark:bg-green-900/20 p-3">
                      <div className="space-y-2">
                        {filterHiddenFields(restoreConfirm.beforeData).slice(0, 15).map(([key, value]) => (
                          <div key={key} className="flex gap-2 text-xs">
                            <span className="text-muted-foreground min-w-[140px]">{translateFieldName(key, language as 'zh' | 'en')}:</span>
                            <span className="text-foreground break-all">{formatValue(value, key)}</span>
                          </div>
                        ))}
                        {filterHiddenFields(restoreConfirm.beforeData).length > 15 && (
                          <p className="text-xs text-muted-foreground italic">
                            ... {t(`还有 ${filterHiddenFields(restoreConfirm.beforeData).length - 15} 个字段`, `${filterHiddenFields(restoreConfirm.beforeData).length - 15} more fields`)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreConfirm(null)} disabled={isRestoring}>{t("取消", "Cancel")}</Button>
            <Button 
              onClick={() => restoreConfirm && handleRestore(restoreConfirm)}
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={isRestoring}
            >
              {isRestoring ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />}
              {isRestoring ? t('恢复中...', 'Restoring...') : t('确认恢复', 'Confirm Restore')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single Item Preview Dialog */}
      <Dialog open={!!restorePreview} onOpenChange={(open) => !open && setRestorePreview(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {t("恢复数据预览", "Restore Data Preview")}
            </DialogTitle>
          </DialogHeader>
          {restorePreview && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-4 pr-4">
                <div className="grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <Label className="text-muted-foreground text-xs">{t("操作模块", "Module")}</Label>
                    <p className="font-medium">{getModuleName(restorePreview.module, language as 'zh' | 'en')}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">{t("操作类型", "Type")}</Label>
                    <div>{getOperationBadge(restorePreview.operationType)}</div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">{t("操作时间", "Time")}</Label>
                    <p className="font-mono text-xs">{new Date(restorePreview.timestamp).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {restorePreview.beforeData && (
                    <div>
                      <Label className="text-sm font-medium text-green-700 dark:text-green-400 mb-2 block">
                        {t("恢复后数据 (原始状态)", "Restored Data (Original State)")}
                      </Label>
                      <div className="rounded-lg border bg-green-50/50 dark:bg-green-900/20 p-3 max-h-[300px] overflow-y-auto">
                        <div className="space-y-1">
                          {filterHiddenFields(restorePreview.beforeData).map(([key, value]) => (
                            <div key={key} className="flex gap-2 text-xs">
                              <span className="text-muted-foreground min-w-[120px] shrink-0">{translateFieldName(key, language as 'zh' | 'en')}:</span>
                              <span className="text-foreground break-all">{formatValue(value, key)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {restorePreview.afterData && (
                    <div>
                      <Label className="text-sm font-medium text-red-700 dark:text-red-400 mb-2 block">
                        {t("当前状态 (将被覆盖)", "Current State (Will Be Overwritten)")}
                      </Label>
                      <div className="rounded-lg border bg-red-50/50 dark:bg-red-900/20 p-3 max-h-[300px] overflow-y-auto">
                        <div className="space-y-1">
                          {filterHiddenFields(restorePreview.afterData).map(([key, value]) => (
                            <div key={key} className="flex gap-2 text-xs">
                              <span className="text-muted-foreground min-w-[120px] shrink-0">{translateFieldName(key, language as 'zh' | 'en')}:</span>
                              <span className="text-foreground break-all">{formatValue(value, key)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestorePreview(null)}>{t("关闭", "Close")}</Button>
            <Button 
              onClick={() => {
                setRestorePreview(null);
                setRestoreConfirm(restorePreview);
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              {t("继续恢复", "Continue Restore")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Batch Preview Dialog */}
      <Dialog open={batchPreviewOpen} onOpenChange={setBatchPreviewOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {t(`批量恢复预览 (${selectedLogs.size} 条记录)`, `Batch Restore Preview (${selectedLogs.size} items)`)}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-3 pr-4">
              {Array.from(selectedLogs).map(logId => {
                const log = filteredLogs.find(l => l.id === logId);
                if (!log) return null;
                return (
                  <div key={logId} className="rounded-lg border p-3 bg-muted/30">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{getModuleName(log.module, language as 'zh' | 'en')}</Badge>
                        {getOperationBadge(log.operationType)}
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">
                        {new Date(log.timestamp).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    {log.objectDescription && (
                      <p className="text-sm text-foreground mb-2">{cleanDescription(log.objectDescription)}</p>
                    )}
                    {log.beforeData && (
                      <div className="text-xs text-muted-foreground">
                        <span className="font-medium">{t("恢复数据预览：", "Restore preview: ")}</span>
                        <span className="font-mono ml-1">
                          {filterHiddenFields(log.beforeData).slice(0, 3).map(([k, v]) => 
                            `${translateFieldName(k, language as 'zh' | 'en')}: ${formatValue(v, k)}`
                          ).join(' | ')}
                          {filterHiddenFields(log.beforeData).length > 3 && ' ...'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchPreviewOpen(false)}>{t("关闭", "Close")}</Button>
            <Button 
              onClick={() => {
                setBatchPreviewOpen(false);
                setBatchRestoreConfirm(true);
              }}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              {t("继续批量恢复", "Continue Batch Restore")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
        </TabsContent>
      </Tabs>
    </div>
  );
}
