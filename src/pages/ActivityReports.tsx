import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StickyScrollTableContainer } from "@/components/ui/sticky-scroll-table";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobileCardActions, MobilePagination, MobileEmptyState } from "@/components/ui/mobile-data-card";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, RefreshCw, Gift, List, Users, Activity, Download, Edit, Trash2, Upload } from "lucide-react";
import TableImportButton from "@/components/TableImportButton";
import { ExportConfirmDialog } from "@/components/ExportConfirmDialog";
import { useExportConfirm } from "@/hooks/useExportConfirm";
import { exportTableToXLSX } from "@/services/dataExportImportService";
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
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import PointsTransactionsTab from "@/components/PointsTransactionsTab";
import MemberManagementContent from "@/components/member/MemberManagementContent";
import MemberActivityDataContent from "@/components/member/MemberActivityDataContent";
import { useTenantView } from "@/contexts/TenantViewContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

import { calculateTransactionFee } from "@/lib/feeCalculation";
import { useAuth } from "@/contexts/AuthContext";
import { getDisplayPhone } from "@/lib/phoneMask";
import { useNameResolvers } from "@/hooks/useNameResolver";
import { useCurrencies } from "@/components/CurrencySelect";
import { usePaymentProviders } from "@/hooks/useMerchantConfig";
import { cleanPhoneNumber, validatePhoneLength } from "@/lib/phoneValidation";
import { useAuditWorkflow } from "@/hooks/useAuditWorkflow";
import { notifyDataMutation } from "@/services/system/dataRefreshManager";
import { safeNumber } from "@/lib/safeCalc";
import { formatBeijingTime } from "@/lib/beijingTime";
import { formatDisplayGiftNumber } from "@/lib/giftNumber";
import { cn } from "@/lib/utils";
import { getActivityDataApi, patchActivityGiftApi, deleteActivityGiftApi } from "@/services/staff/dataApi";
import { getEmployeeNameById } from "@/services/members/nameResolver";
import { listEmployeesApi } from "@/api/employees";
import { logOperation } from "@/stores/auditLogStore";

interface ActivityRecord {
  id: string;
  giftNumber?: string;
  order: number;
  time: string;
  currency: string;
  amount: string;
  rate: number;
  phone: string;
  paymentAgent: string;
  giftType: string;
  fee: number;
  giftValue: number;
  remark: string;
  recorder: string;
  creatorId: string; // 录入人ID
  createdAt: string;
}

// 计算赠送价值
const calculateGiftValue = (currency: string, amount: string, rate: number, fee: number): number => {
  const amountNum = parseFloat(amount) || 0;
  if (!amountNum || !rate) return 0;
  
  if (currency === "NGN") {
    return Math.abs(amountNum) / rate + fee;
  } else {
    return Math.abs(amountNum) * rate + fee;
  }
};

/** 与 handleSave 非管理员分支变更检测一致，供主按钮「提交审核 / 确认修改」 */
function computeActivityGiftFieldChanges(
  form: {
    currency: string;
    amount: string;
    rate: string;
    phone: string;
    paymentAgent: string;
    giftType: string;
    remark: string;
  },
  record: ActivityRecord,
): { fieldKey: string; oldValue: unknown; newValue: unknown }[] {
  const changes: { fieldKey: string; oldValue: unknown; newValue: unknown }[] = [];
  const rate = parseFloat(form.rate) || 0;
  if (form.currency !== record.currency) {
    changes.push({ fieldKey: "currency", oldValue: record.currency, newValue: form.currency });
  }
  if (form.amount !== record.amount) {
    changes.push({ fieldKey: "amount", oldValue: record.amount, newValue: form.amount });
  }
  if (rate !== record.rate) {
    changes.push({ fieldKey: "rate", oldValue: record.rate, newValue: rate });
  }
  if (form.phone !== record.phone) {
    changes.push({ fieldKey: "phone_number", oldValue: record.phone, newValue: form.phone });
  }
  if (form.paymentAgent !== record.paymentAgent) {
    changes.push({ fieldKey: "payment_agent", oldValue: record.paymentAgent, newValue: form.paymentAgent });
  }
  if (form.giftType !== record.giftType) {
    changes.push({ fieldKey: "gift_type", oldValue: record.giftType, newValue: form.giftType });
  }
  if (form.remark !== record.remark) {
    changes.push({ fieldKey: "remark", oldValue: record.remark, newValue: form.remark });
  }
  return changes;
}

// 从 Supabase 数据库加载活动赠送记录
const loadActivityRecordsFromDB = async (tenantId?: string | null): Promise<ActivityRecord[]> => {
  try {
    // 导入名称解析器
    const { getEmployeeNameById } = await import('@/services/members/nameResolver');
    const activityData = await getActivityDataApi(tenantId);

    return (activityData.gifts || []).map((gift: any, index: number) => {
      const rate = safeNumber(gift.rate);
      const fee = gift.fee !== undefined ? safeNumber(gift.fee) : calculateTransactionFee(gift.currency, String(gift.amount ?? '0'));
      const giftValue = gift.gift_value !== undefined
        ? safeNumber(gift.gift_value)
        : calculateGiftValue(gift.currency, String(gift.amount ?? '0'), rate, fee);
      
      // 录入人姓名：只通过 creator_id 从员工表实时获取，不使用 name 快照
      const recorder = gift.creator_id 
        ? getEmployeeNameById(gift.creator_id) 
        : '';
      
      return {
        id: gift.id,
        giftNumber: gift.gift_number || '',
        order: index + 1,
        time: formatBeijingTime(gift.created_at),
        currency: gift.currency,
        amount: String(gift.amount),
        rate,
        phone: gift.phone_number,
        paymentAgent: gift.payment_agent || "",
        giftType: gift.gift_type || "",
        fee: safeNumber(fee),
        giftValue: safeNumber(giftValue),
        remark: gift.remark || "",
        recorder,
        creatorId: gift.creator_id || "",
        createdAt: gift.created_at,
      };
    });
  } catch (error) {
    console.error('Failed to load activity gifts from DB:', error);
    return [];
  }
};

const updateActivityRecordInDB = async (id: string, record: Partial<ActivityRecord>, creatorId?: string): Promise<boolean> => {
  try {
    const updateData: Record<string, unknown> = {
      currency: record.currency,
      amount: parseFloat(record.amount || '0'),
      rate: record.rate,
      phone_number: record.phone,
      payment_agent: record.paymentAgent,
      gift_type: record.giftType,
      fee: record.fee,
      gift_value: record.giftValue,
      remark: record.remark,
    };
    if (creatorId !== undefined) {
      updateData.creator_id = creatorId || null;
    }
    const updated = await patchActivityGiftApi(id, updateData);
    if (!updated) throw new Error('update failed');
    return true;
  } catch (error) {
    console.error('Failed to update activity gift:', error);
    return false;
  }
};

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

const TAB_MAP: Record<string, string> = { members: "members", activity: "activity", gifts: "gifts", points: "points" };
const TAB_LABELS: Record<string, { zh: string; en: string }> = {
  members: { zh: "会员数据", en: "Member Data" },
  activity: { zh: "活动数据", en: "Activity Data" },
  gifts: { zh: "活动赠送", en: "Activity Gifts" },
  points: { zh: "积分明细", en: "Points Ledger" },
};

const MEMBER_TAB_ORDER = ["members", "activity", "gifts", "points"] as const;

export default function ActivityReports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = TAB_MAP[searchParams.get("tab") || ""] || "members";
  const { t } = useLanguage();
  const { isAdmin, employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const { resolveActivityTypeLabel, resolvePaymentProviderName, activityTypeMap } = useNameResolvers();
  const { currencies } = useCurrencies();
  const { activeProviders } = usePaymentProviders();
  const { checkNeedsApproval, submitBatchForApproval } = useAuditWorkflow();
  const [activeTab, setActiveTab] = useState(tabFromUrl);

  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);
  const queryClient = useQueryClient();
  const prevMemberTabRef = useRef<string | null>(null);
  useEffect(() => {
    if (prevMemberTabRef.current === null) {
      prevMemberTabRef.current = tabFromUrl;
      return;
    }
    if (prevMemberTabRef.current === tabFromUrl) return;
    prevMemberTabRef.current = tabFromUrl;

    if (tabFromUrl === "members") {
      void queryClient.invalidateQueries({ queryKey: ["members"] });
      void queryClient.invalidateQueries({ queryKey: ["activity-report-members-map"] });
    } else if (tabFromUrl === "activity") {
      void queryClient.invalidateQueries({ queryKey: ["activity-data-content"] });
      void queryClient.invalidateQueries({ queryKey: ["members"] });
    } else if (tabFromUrl === "gifts") {
      void queryClient.invalidateQueries({ queryKey: ["activity-records"] });
      void queryClient.invalidateQueries({ queryKey: ["activity-report-members-map"] });
    } else if (tabFromUrl === "points") {
      void queryClient.invalidateQueries({ queryKey: ["points-ledger"] });
      void queryClient.invalidateQueries({ queryKey: ["members"] });
    }
  }, [tabFromUrl, queryClient]);
  const exportConfirm = useExportConfirm();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchError, setSearchError] = useState("");
  const [memberSearchTerm, setMemberSearchTerm] = useState("");
  const [memberSearchError, setMemberSearchError] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<ActivityRecord | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<ActivityRecord | null>(null);
  // react-query cached data — staleTime 与全局默认一致(2min)，避免短时间内反复切换时重复请求
  const { data: records = [] } = useQuery({
    queryKey: ['activity-records', effectiveTenantId ?? ''],
    queryFn: () => loadActivityRecordsFromDB(effectiveTenantId),
  });

  const { data: employeeList = [] } = useQuery({
    queryKey: ['activity-report-employees', effectiveTenantId ?? ''],
    queryFn: async () => {
      const data = await listEmployeesApi(effectiveTenantId ? { tenant_id: effectiveTenantId } : undefined);
      return data
        .filter((e) => e.status === 'active')
        .map((e) => ({ id: e.id, realName: e.real_name }));
    },
  });

  const { data: membersMap = new Map<string, string>() } = useQuery({
    queryKey: ['activity-report-members-map', effectiveTenantId ?? ''],
    queryFn: async () => {
      const data = await import('@/services/members/membersApiService').then(m => m.listMembersApi({ tenant_id: effectiveTenantId || undefined, limit: 10000 }));
      const map = new Map<string, string>();
      (data || []).forEach(m => map.set(m.phone_number, m.member_code));
      return map;
    },
  });
const [editFormData, setEditFormData] = useState({
    currency: "NGN",
    amount: "",
    rate: "",
    phone: "",
    paymentAgent: "",
    giftType: "",
    remark: "",
    creatorId: "", // 录入人ID - 只有总管理员可以修改
  });
  const [activityGiftPreferSubmitReview, setActivityGiftPreferSubmitReview] = useState(false);

  useEffect(() => {
    if (!isDialogOpen || !editingRecord || isAdmin) {
      setActivityGiftPreferSubmitReview(false);
      return;
    }
    const changes = computeActivityGiftFieldChanges(editFormData, editingRecord);
    if (changes.length === 0) {
      setActivityGiftPreferSubmitReview(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      for (const c of changes) {
        if (await checkNeedsApproval("activity", c.fieldKey)) {
          if (!cancelled) setActivityGiftPreferSubmitReview(true);
          return;
        }
      }
      if (!cancelled) setActivityGiftPreferSubmitReview(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isDialogOpen, editingRecord, isAdmin, editFormData, checkNeedsApproval]);
  
  // employeeList is now from useQuery above

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Realtime handled centrally by dataRefreshManager → TABLE_QUERY_KEYS['activity_gifts'] + ['members']

  // 数据变更时 notifyDataMutation / dataRefreshManager 会按表 invalidate；侧栏切页不再全量刷 Query。

  // 需求3：活动赠送搜索优化 - 支持按类型搜索和会员编号搜索
  const filteredRecords = useMemo(() => {
    const term = searchTerm.toLowerCase().trim();
    if (!term) return records;
    return records.filter((r) => {
      // 按电话号码搜索
      if (String(r.phone ?? '').toLowerCase().includes(term)) return true;
      // 按会员编号搜索（通过电话号码→会员编号映射）
      const memberCode = membersMap.get(r.phone);
      if (String(memberCode ?? '').toLowerCase().includes(term)) return true;
      // 按代付商家搜索
      if (String(r.paymentAgent ?? '').toLowerCase().includes(term)) return true;
      // 按币种搜索
      if (String(r.currency ?? '').toLowerCase().includes(term)) return true;
      // 按类型搜索（支持类型代码和标签）
      if (r.giftType) {
        if (String(r.giftType ?? '').toLowerCase().includes(term)) return true;
        const typeLabel = r.giftType === 'activity_1' ? '活动1兑换' : 
                          r.giftType === 'activity_2' ? '活动2兑换' : 
                          resolveActivityTypeLabel(r.giftType);
        if (String(typeLabel ?? '').toLowerCase().includes(term)) return true;
      }
      return false;
    });
  }, [records, searchTerm, resolveActivityTypeLabel, membersMap]);

  // Paginated records
  const paginatedRecords = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredRecords.length / pageSize);

  // Reset to first page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize]);

  const handleRefresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['activity-records'] });
    toast.success(t("已刷新", "Refreshed"));
  };

  const handleMemberRefresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["members"] });
    notifyDataMutation({ table: 'members', operation: '*', source: 'manual' }).catch(console.error);
  };


  const handleEdit = (record: ActivityRecord) => {
    setEditingRecord(record);
    
    // 验证代付商家是否存在于当前活跃商家列表
    const activeAgents = activeProviders.filter(p => p.status === "active");
    const agentExists = activeAgents.some(p => p.name === record.paymentAgent);
    
    setEditFormData({
      currency: record.currency,
      amount: record.amount,
      rate: record.rate.toString(),
      phone: record.phone,
      // 如果商家不存在于当前列表，保持原值但会在保存时验证
      paymentAgent: agentExists ? record.paymentAgent : record.paymentAgent,
      giftType: record.giftType,
      remark: record.remark,
      creatorId: record.creatorId || "",
    });
    
    // 如果商家不在当前活跃列表中，显示警告
    if (!agentExists && record.paymentAgent) {
      toast.warning(t(
        `代付商家 "${record.paymentAgent}" 已不在活跃商家列表中，请重新选择`,
        `Payment agent "${record.paymentAgent}" is no longer active, please select another`
      ));
    }
    
    setIsDialogOpen(true);
  };

  const handleDeleteClick = (record: ActivityRecord) => {
    setRecordToDelete(record);
    setDeleteDialogOpen(true);
  };

  // 需求3：删除活动赠送记录并退回积分（使用事务性RPC），同时记录操作日志和余额变动
  const handleConfirmDelete = async () => {
    if (recordToDelete) {
      try {
        const result = await deleteActivityGiftApi(recordToDelete.id, effectiveTenantId);
        const giftData = result.gift as Record<string, any> | null;

        if (!giftData) {
          toast.error(t("删除失败", "Delete failed"));
        } else {
          // 记录余额变动日志（撤回赠送支出）
          if (giftData.payment_agent && Number(giftData.gift_value) > 0) {
            const { logGiftDeleteBalanceChange } = await import('@/services/finance/balanceLogService');
            logGiftDeleteBalanceChange({
              providerName: giftData.payment_agent,
              giftValue: Number(giftData.gift_value),
              giftId: recordToDelete.id,
              giftCreatedAt: giftData.created_at,
              operatorId: employee?.id,
              operatorName: employee?.real_name,
            }).catch(err => console.error('[handleConfirmDelete] Balance log failed:', err));
          }

          logOperation(
            'activity_gift',
            'delete',
            recordToDelete.id,
            giftData,
            null,
            `删除活动赠送: ${recordToDelete.phone} - ${recordToDelete.currency} ${recordToDelete.amount}`
          );

          await queryClient.invalidateQueries({ queryKey: ['activity-records'] });
          notifyDataMutation({ table: 'activity_gifts', operation: 'DELETE', source: 'manual' }).catch(console.error);
          notifyDataMutation({ table: 'points_ledger', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          const restoredPoints = result.restored_points || 0;
          if (restoredPoints > 0) {
            toast.success(t(`已删除并退回 ${restoredPoints} 积分`, `Deleted and restored ${restoredPoints} points`));
          } else {
            toast.success(t("已删除", "Deleted"));
          }
        }
      } catch (err) {
        console.error('Delete error:', err);
        toast.error(t("删除失败", "Delete failed"));
      }
    }
    setDeleteDialogOpen(false);
    setRecordToDelete(null);
  };

  const handleSave = async () => {
    if (!editingRecord) return;
    
    // 验证代付商家是否为有效选项
    const activeAgents = activeProviders.filter(p => p.status === "active");
    const agentValid = activeAgents.some(p => p.name === editFormData.paymentAgent);
    if (!agentValid && editFormData.paymentAgent) {
      toast.error(t(
        "请选择有效的代付商家",
        "Please select a valid payment agent"
      ));
      return;
    }
    
    // 验证活动类型是否为有效选项
    const activeTypes = Array.from(activityTypeMap.values()).filter((entry) => entry.isActive);
    const typeValid = activeTypes.some(t => t.value === editFormData.giftType);
    if (!typeValid && editFormData.giftType) {
      toast.error(t(
        "请选择有效的活动类型",
        "Please select a valid activity type"
      ));
      return;
    }
    
    const rate = parseFloat(editFormData.rate) || 0;
    const fee = calculateTransactionFee(editFormData.currency, editFormData.amount);
    const giftValue = calculateGiftValue(editFormData.currency, editFormData.amount, rate, fee);

    // 管理员直接编辑
    if (isAdmin) {
      // 只有总管理员可以修改录入人
      const creatorIdToUpdate = employee?.is_super_admin && editFormData.creatorId !== editingRecord.creatorId
        ? editFormData.creatorId
        : undefined;
      
      const success = await updateActivityRecordInDB(editingRecord.id, {
        currency: editFormData.currency,
        amount: editFormData.amount,
        rate,
        phone: editFormData.phone,
        paymentAgent: editFormData.paymentAgent,
        giftType: editFormData.giftType,
        fee,
        giftValue,
        remark: editFormData.remark,
      }, creatorIdToUpdate);
      if (success) {
        // 记录赠送编辑的余额变动（差额调整）
        const oldGiftValue = editingRecord.giftValue || 0;
        if (editFormData.paymentAgent && (Math.abs(giftValue - oldGiftValue) > 0.01 || editFormData.paymentAgent !== editingRecord.paymentAgent)) {
          try {
            const { logGiftUpdateBalanceChange, logGiftDeleteBalanceChange, logGiftBalanceChange } = await import('@/services/finance/balanceLogService');
            
            if (editFormData.paymentAgent !== editingRecord.paymentAgent) {
              // 代付商家变更：旧商家回收 + 新商家支出
              if (editingRecord.paymentAgent && oldGiftValue > 0) {
                await logGiftDeleteBalanceChange({
                  providerName: editingRecord.paymentAgent,
                  giftValue: oldGiftValue,
                  giftId: editingRecord.id,
                  giftCreatedAt: editingRecord.createdAt,
                  operatorId: employee?.id,
                  operatorName: employee?.real_name,
                });
              }
              if (editFormData.paymentAgent && giftValue > 0) {
                await logGiftBalanceChange({
                  providerName: editFormData.paymentAgent,
                  giftValue,
                  giftId: editingRecord.id,
                  phoneNumber: editFormData.phone,
                  operatorId: employee?.id,
                  operatorName: employee?.real_name,
                });
                // 新商家也需要检查 postResetAdjustment（赠送 created_at 在重置前）
                if (editingRecord.createdAt) {
                  const { applyPostResetAdjustmentIfNeeded } = await import('@/services/finance/balanceLogService');
                  await applyPostResetAdjustmentIfNeeded('payment_provider', editFormData.paymentAgent, editingRecord.createdAt, -giftValue);
                }
              }
            } else {
              // 同一商家，记录差额调整
              await logGiftUpdateBalanceChange({
                providerName: editFormData.paymentAgent,
                oldGiftValue,
                newGiftValue: giftValue,
                giftId: editingRecord.id,
                giftCreatedAt: editingRecord.createdAt,
                operatorId: employee?.id,
                operatorName: employee?.real_name,
              });
            }
          } catch (err) {
            console.error('[ActivityReports] Gift balance log failed:', err);
          }
        }
        
        await queryClient.invalidateQueries({ queryKey: ['activity-records'] });
        notifyDataMutation({ table: 'activity_gifts', operation: 'UPDATE', source: 'manual' }).catch(console.error);
        toast.success(t("已更新", "Updated"));
      } else {
        toast.error(t("更新失败", "Update failed"));
      }
    } else {
      // 非管理员提交审核
      const changes = computeActivityGiftFieldChanges(editFormData, editingRecord);
      
      if (changes.length === 0) {
        toast.info(t("没有检测到修改", "No changes detected"));
      } else {
        const result = await submitBatchForApproval({
          module: 'activity',
          changes,
          targetId: editingRecord.id,
          targetDescription: `活动赠送: ${editingRecord.phone} - ${editingRecord.currency} ${editingRecord.amount}`,
          originalData: editingRecord,
        });
        
        if (result.submitted) {
          toast.success(t("已提交审核，等待管理员审批", "Submitted for review"));
        } else if (result.hasRejected) {
          toast.error(result.message);
        } else {
          toast.info(result.message);
        }
      }
    }
    
    setIsDialogOpen(false);
    setEditingRecord(null);
  };

  const handleMemberSubTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === "members") {
        next.delete("tab");
      } else {
        next.set("tab", value);
      }
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="shrink-0">
        <Tabs
          value={activeTab}
          onValueChange={handleMemberSubTabChange}
          className="w-full flex flex-col flex-1 min-h-0"
        >
          {/* 移动端无侧栏时必须有可见子标签；活动数据 / 积分明细 的刷新、导出放在本行最右侧 */}
          <div className="flex w-full min-w-0 items-center gap-2 pb-2 -mx-1 px-1">
            <div
              className={cn(
                "min-w-0 flex-1 overflow-x-auto overflow-y-hidden",
                isMobile && "native-scroll-y"
              )}
            >
              <TabsList
                className={cn(
                  "inline-flex h-auto w-max min-w-full flex-nowrap items-stretch justify-start gap-1 rounded-lg bg-muted/90 p-1 sm:flex-wrap sm:min-w-0 sm:w-full sm:justify-start"
                )}
              >
                {MEMBER_TAB_ORDER.map((key) => (
                  <TabsTrigger
                    key={key}
                    value={key}
                    className={cn(
                      "shrink-0 rounded-md px-3 py-2.5 text-xs font-semibold sm:px-4 sm:py-2 sm:text-sm",
                      "min-h-[44px] sm:min-h-9 data-[state=active]:shadow-sm",
                      "whitespace-nowrap"
                    )}
                  >
                    {t(TAB_LABELS[key].zh, TAB_LABELS[key].en)}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
            {(activeTab === "activity" || activeTab === "points") && (
              <div className="flex shrink-0 items-center gap-2">
                {activeTab === "activity" && (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 touch-manipulation"
                      onClick={() => window.dispatchEvent(new CustomEvent("activity-refresh"))}
                      aria-label={t("刷新", "Refresh")}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    {isAdmin && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9 touch-manipulation"
                        onClick={() =>
                          exportConfirm.requestExport(() => window.dispatchEvent(new CustomEvent("activity-export")))
                        }
                      >
                        <Download className="h-4 w-4 sm:mr-1" />
                        {!isMobile && <span>{t("导出", "Export")}</span>}
                      </Button>
                    )}
                  </>
                )}
                {activeTab === "points" && (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 touch-manipulation"
                      onClick={() => window.dispatchEvent(new CustomEvent("points-ledger-refresh"))}
                      aria-label={t("刷新", "Refresh")}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 touch-manipulation"
                      onClick={() =>
                        exportConfirm.requestExport(() =>
                          window.dispatchEvent(new CustomEvent("points-ledger-export")),
                        )
                      }
                    >
                      <Download className="h-4 w-4 sm:mr-1" />
                      {!isMobile && <span>{t("导出", "Export")}</span>}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>

          {(activeTab === "members" || activeTab === "gifts") && (
          <div className={isMobile ? "flex flex-col gap-3" : "flex items-center justify-between gap-4 flex-wrap"}>
            {activeTab === "members" && (
              <div className={isMobile ? "flex flex-col gap-2" : "flex items-center gap-3"}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("搜索电话/商家/币种/类型...", "Search phone/agent/currency/type...")}
                    value={memberSearchTerm}
                    onChange={(e) => {
                      setMemberSearchTerm(e.target.value);
                      setMemberSearchError("");
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const pasted = e.clipboardData.getData('text').replace(/[^a-zA-Z0-9]/g, '');
                      setMemberSearchTerm(pasted);
                      setMemberSearchError("");
                    }}
                    className={`pl-9 ${isMobile ? 'w-full' : 'w-64'} ${memberSearchError ? 'border-destructive' : ''}`}
                    autoComplete="off"
                    name="members-search"
                    data-lpignore="true"
                  />
                  {memberSearchError && <span className="text-xs text-destructive whitespace-nowrap">{memberSearchError}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={handleMemberRefresh}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                  <TableImportButton tableName="members" onImportComplete={handleMemberRefresh} />
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        exportConfirm.requestExport(async () => {
                          const r = await exportTableToXLSX("members", false);
                          if (r.success) toast.success(t("已导出 Excel（.xlsx）", "Exported as Excel (.xlsx)"));
                          else if (r.error) toast.error(r.error);
                        })
                      }
                    >
                      <Download className="h-4 w-4" />
                      {!isMobile && <span className="ml-1">{t("导出", "Export")}</span>}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {activeTab === "gifts" && (
              <div className={isMobile ? "flex flex-col gap-2" : "flex items-center gap-3"}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t("搜索电话/会员编号/商家/币种/类型...", "Search phone/code/agent/currency/type...")}
                    value={searchTerm}
                    onChange={(e) => {
                      setSearchTerm(e.target.value);
                      setSearchError("");
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const pasted = e.clipboardData.getData('text').replace(/[^a-zA-Z0-9]/g, '');
                      setSearchTerm(pasted);
                      setSearchError("");
                    }}
                    className={`pl-9 ${isMobile ? 'w-full' : 'w-64'} ${searchError ? 'border-destructive' : ''}`}
                    autoComplete="off"
                    name="gifts-search"
                    data-lpignore="true"
                  />
                  {searchError && <span className="text-xs text-destructive whitespace-nowrap">{searchError}</span>}
                </div>
                <Button variant="outline" size="icon" onClick={handleRefresh}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          )}

          <TabsContent
            value="members"
            className="mt-4 flex-1 min-h-0 overflow-y-auto"
            data-spa-scroll-root="activity-reports-members"
          >
            <ErrorBoundary>
              <MemberManagementContent searchTerm={memberSearchTerm} />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent
            value="activity"
            className="mt-4 flex-1 min-h-0 overflow-y-auto"
            data-spa-scroll-root="activity-reports-activity"
          >
            <ErrorBoundary>
              <MemberActivityDataContent />
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="gifts" className="mt-4 flex-1 min-h-0 flex flex-col">
            <ErrorBoundary>
            <Card className="flex-1 min-h-0 flex flex-col">
              <CardContent className="pt-4 flex-1 min-h-0 flex flex-col">
                {useCompactLayout ? (
                  <>
                    <MobileCardList>
                      {paginatedRecords.length === 0 ? (
                        <MobileEmptyState message={t("暂无活动赠送数据", "No activity gift data")} />
                      ) : (
                        paginatedRecords.map((record) => (
                          <MobileCard key={record.id} accent="default">
                            <MobileCardHeader>
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary">{record.currency}</Badge>
                                <span className="font-semibold">{record.amount}</span>
                              </div>
                              <span className="text-xs text-muted-foreground">{record.time}</span>
                            </MobileCardHeader>
                            <MobileCardRow label={t("赠送编号", "Gift ID")} value={formatDisplayGiftNumber(record.giftNumber, record.id)} />
                            <MobileCardRow label={t("电话号码", "Phone")} value={getDisplayPhone(record.phone, isAdmin)} />
                            <MobileCardRow label={t("代付商家", "Agent")} value={resolvePaymentProviderName(record.paymentAgent)} />
                            <MobileCardRow label={t("赠送价值", "Gift Value")} value={record.giftValue.toFixed(2)} highlight />
                            <MobileCardCollapsible>
                              <MobileCardRow label={t("汇率", "Rate")} value={record.rate} />
                              <MobileCardRow label={t("手续费", "Fee")} value={record.fee} />
                              <MobileCardRow label={t("类型", "Type")} value={
                                record.giftType ? (
                                  record.giftType === 'activity_1' ? '活动1兑换' : 
                                  record.giftType === 'activity_2' ? '活动2兑换' : 
                                  resolveActivityTypeLabel(record.giftType)
                                ) : '-'
                              } />
                              <MobileCardRow label={t("备注", "Remark")} value={record.remark || '-'} />
                              <MobileCardRow label={t("录入人", "Recorder")} value={record.recorder} />
                            </MobileCardCollapsible>
                            <MobileCardActions>
                              <Button variant="ghost" size="sm" className="h-9 flex-1 touch-manipulation" onClick={() => handleEdit(record)}>
                                <Edit className="h-4 w-4 mr-1" />{t("编辑", "Edit")}
                              </Button>
                              <Button variant="ghost" size="sm" className="h-9 flex-1 touch-manipulation text-destructive hover:text-destructive" onClick={() => handleDeleteClick(record)}>
                                <Trash2 className="h-4 w-4 mr-1" />{t("删除", "Delete")}
                              </Button>
                            </MobileCardActions>
                          </MobileCard>
                        ))
                      )}
                      <MobilePagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={filteredRecords.length}
                        onPageChange={setCurrentPage}
                        pageSize={pageSize}
                        onPageSizeChange={setPageSize}
                      />
                    </MobileCardList>
                  </>
                ) : (
                <StickyScrollTableContainer minWidth="1400px">
                  <Table className="text-xs">
                    <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                        <TableRow className="bg-muted/50">
                        <TableHead className="w-[60px] text-center px-1.5">{t("排序", "Order")}</TableHead>
                        <TableHead className="w-[110px] text-center px-1.5 font-mono">{t("赠送编号", "Gift ID")}</TableHead>
                        <TableHead className="w-[160px] text-center px-1.5">{t("录入时间", "Time")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("赠送币种", "Currency")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("赠送金额", "Amount")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("汇率", "Rate")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("电话号码", "Phone")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("代付商家", "Agent")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("类型", "Type")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("手续费", "Fee")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("赠送价值", "Gift Value")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("备注", "Remark")}</TableHead>
                        <TableHead className="text-center px-1.5">{t("录入人", "Recorder")}</TableHead>
                        <TableHead className="w-[100px] text-center px-1.5">{t("操作", "Actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedRecords.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={14} className="text-center py-12 text-muted-foreground">
                            {t("暂无活动赠送数据", "No activity gift data")}
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedRecords.map((record) => (
                          <TableRow key={record.id}>
                            <TableCell className="text-center px-1.5">{record.order}</TableCell>
                            <TableCell className="text-center px-1.5 font-mono text-muted-foreground text-xs">{formatDisplayGiftNumber(record.giftNumber, record.id)}</TableCell>
                            <TableCell className="text-center px-1.5">{record.time}</TableCell>
                            <TableCell className="text-center px-1.5">
                              <Badge variant="secondary">{record.currency}</Badge>
                            </TableCell>
                            <TableCell className="text-center px-1.5">{record.amount}</TableCell>
                            <TableCell className="text-center px-1.5">{record.rate}</TableCell>
                            <TableCell className="text-center px-1.5">{getDisplayPhone(record.phone, isAdmin)}</TableCell>
                            <TableCell className="text-center px-1.5">{resolvePaymentProviderName(record.paymentAgent)}</TableCell>
                            <TableCell className="text-center px-1.5">
                              {record.giftType && (
                                <Badge variant="outline">
                                  {record.giftType === 'activity_1' ? '活动1兑换' : 
                                   record.giftType === 'activity_2' ? '活动2兑换' : 
                                   resolveActivityTypeLabel(record.giftType)}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-center px-1.5">{record.fee}</TableCell>
                            <TableCell className="text-center px-1.5">{record.giftValue.toFixed(2)}</TableCell>
                            <TableCell className="text-muted-foreground max-w-[150px] truncate text-center px-1.5">{record.remark}</TableCell>
                            <TableCell className="text-center px-1.5">{record.recorder}</TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 touch-manipulation"
                                  onClick={() => handleEdit(record)}
                                >
                                  <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 touch-manipulation text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteClick(record)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </StickyScrollTableContainer>
                )}

                {/* Pagination - 仅桌面端显示（移动/平板端已有 MobilePagination） */}
                {!useCompactLayout && filteredRecords.length > 0 && (
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>{t("每页显示", "Per page")}</span>
                      <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(Number(v))}>
                        <SelectTrigger className="w-20 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAGE_SIZE_OPTIONS.map(size => (
                            <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span>{t("条", "items")}</span>
                      <span className="ml-4">
                        {t("共", "Total")} {filteredRecords.length} {t("条记录", "records")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                      >
                        {t("上一页", "Previous")}
                      </Button>
                      <span className="text-sm text-muted-foreground px-2">
                        {currentPage} / {totalPages || 1}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage >= totalPages}
                      >
                        {t("下一页", "Next")}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            </ErrorBoundary>
          </TabsContent>

          <TabsContent value="points" className="mt-4">
            <ErrorBoundary>
              <PointsTransactionsTab toolbarActionsInTabRow />
            </ErrorBoundary>
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认删除", "Confirm Delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("确定要删除这条赠送记录吗？此操作无法撤销。", "Are you sure you want to delete this gift record? This action cannot be undone.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("删除", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


      <DrawerDetail
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) setEditingRecord(null);
        }}
        title={t("编辑记录", "Edit Record")}
        sheetMaxWidth="2xl"
      >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t("赠送币种", "Currency")}</Label>
              <Select value={editFormData.currency} onValueChange={(v) => setEditFormData({ ...editFormData, currency: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={t("请选择币种", "Select currency")} />
                </SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.code} - {c.name_zh}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("赠送金额", "Amount")}</Label>
              <Input
                value={editFormData.amount}
                onChange={(e) => setEditFormData({ ...editFormData, amount: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("汇率", "Rate")}</Label>
              <Input
                type="number"
                step="0.01"
                value={editFormData.rate}
                onChange={(e) => setEditFormData({ ...editFormData, rate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("电话号码", "Phone")}</Label>
              <Input
                value={editFormData.phone}
                onChange={(e) => setEditFormData({ ...editFormData, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("代付商家", "Agent")}</Label>
              <Select value={editFormData.paymentAgent} onValueChange={(v) => setEditFormData({ ...editFormData, paymentAgent: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={t("请选择代付商家", "Select agent")} />
                </SelectTrigger>
                <SelectContent>
                  {activeProviders.filter(p => p.status === "active").map((provider) => (
                    <SelectItem key={provider.id} value={provider.name}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("类型", "Type")}</Label>
              <Select value={editFormData.giftType} onValueChange={(v) => setEditFormData({ ...editFormData, giftType: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={t("请选择类型", "Select type")} />
                </SelectTrigger>
                <SelectContent>
                  {/* 从系统设置活动类型读取，显示活动类型名称 */}
                  {Array.from(activityTypeMap.values()).filter((entry) => entry.isActive).map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* 录入人 - 只有总管理员可以看到和修改 */}
            {employee?.is_super_admin && (
              <div className="space-y-2">
                <Label>{t("录入人", "Recorder")}</Label>
                <Select value={editFormData.creatorId} onValueChange={(v) => setEditFormData({ ...editFormData, creatorId: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("请选择录入人", "Select recorder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {employeeList.map((emp) => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.realName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className={`space-y-2 ${employee?.is_super_admin ? '' : 'col-span-2'}`}>
              <Label>{t("备注", "Remark")}</Label>
              <Input
                value={editFormData.remark}
                onChange={(e) => setEditFormData({ ...editFormData, remark: e.target.value })}
              />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4 mt-4">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              {t("取消", "Cancel")}
            </Button>
            <Button
              onClick={handleSave}
              className={cn(!isAdmin && activityGiftPreferSubmitReview && "bg-amber-500 text-white hover:bg-amber-600")}
            >
              {isAdmin
                ? t("确认修改", "Confirm Edit")
                : activityGiftPreferSubmitReview
                  ? t("提交审核", "Submit for Review")
                  : t("确认修改", "Confirm Edit")}
            </Button>
          </div>
      </DrawerDetail>

      <ExportConfirmDialog
        open={exportConfirm.open}
        onOpenChange={exportConfirm.handleOpenChange}
        onConfirm={exportConfirm.handleConfirm}
      />
    </div>
  );
}
