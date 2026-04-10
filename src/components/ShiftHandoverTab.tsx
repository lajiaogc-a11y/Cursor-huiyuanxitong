// ============= 交班对账Tab组件 =============
// 在汇率计算页面使用，显示商家余额并提交交班记录
// 余额计算逻辑与商家结算页面完全一致（共享计算服务）
// 🔧 修复：等待持久化数据加载后再执行loadData + 模块级缓存 + 分离余额刷新

import { useState, useEffect, useCallback, useRef } from 'react';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DrawerDetail } from '@/components/shell/DrawerDetail';
import { Plus, Send, Loader2, UserPlus, RefreshCw, Pencil, Trash2, CircleHelp } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantView } from '@/contexts/TenantViewContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getMyTenantOrdersFull, getMyTenantUsdtOrdersFull, getTenantOrdersFull, getTenantUsdtOrdersFull } from '@/services/tenantService';
import { safeToFixed } from '@/lib/safeCalc';
import { isUserTyping, trackRender } from '@/lib/performanceUtils';
import {
  getCardMerchantSettlements,
  getPaymentProviderSettlements,
  forceRefreshSettlementCache,
} from '@/services/finance/merchantSettlementService';
import { notify } from "@/lib/notifyHub";
import {
  getShiftReceivers,
  addShiftReceiver,
  updateShiftReceiver,
  deleteShiftReceiver,
  createShiftHandover,
  CardMerchantHandoverData,
  PaymentProviderHandoverData,
  ShiftReceiver,
} from '@/services/finance/shiftHandoverService';
import {
  calculateAllVendorBalances,
  calculateAllProviderBalances,
  VendorBalanceResult,
  ProviderBalanceResult,
} from '@/services/finance/settlementCalculationService';
import { useShiftHandoverFormPersistence } from '@/hooks/staff/useShiftHandoverFormPersistence';
import { listVendorsApi, listPaymentProvidersApi } from '@/services/shared/entityLookupService';

interface VendorBalance {
  vendorName: string;
  balance: number;
  inputValue: string;
}

interface ProviderBalance {
  providerName: string;
  balance: number;
  inputValue: string;
}

// ============= 模块级缓存 =============
// 用于避免页面切换时重复加载数据
interface BalanceDataCache {
  vendorBalances: { vendorName: string; balance: number }[];
  providerBalances: { providerName: string; balance: number }[];
  receivers: ShiftReceiver[];
  timestamp: number;
}

let balanceDataCache: BalanceDataCache | null = null;
const CACHE_TTL_MS = 30000; // 30秒缓存有效期

// 判断缓存是否有效
const isCacheValid = (): boolean => {
  if (!balanceDataCache) return false;
  return Date.now() - balanceDataCache.timestamp < CACHE_TTL_MS;
};

// 使缓存失效（导出供外部使用）
export const invalidateShiftHandoverCache = () => {
  balanceDataCache = null;
};

/** 商家余额手填项：必须显式填写（允许 0，不允许空） */
function isFilledBalanceInput(raw: string): boolean {
  const s = String(raw ?? "").trim();
  if (s === "") return false;
  const n = Number(s);
  return Number.isFinite(n);
}

export default function ShiftHandoverTab() {
  trackRender('ShiftHandoverTab');
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;
  const useMyTenantRpc = !!(effectiveTenantId && employee?.tenant_id && effectiveTenantId === employee.tenant_id);
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // 使用持久化表单 Hook
  const {
    selectedReceiver,
    remark,
    setSelectedReceiver,
    setVendorInput,
    setProviderInput,
    setRemark,
    getVendorInput,
    getProviderInput,
    clearForm: clearPersistedForm,
    isLoading: isFormLoading,
  } = useShiftHandoverFormPersistence();
  
  // 余额数据（不需要持久化）
  const [vendorBalances, setVendorBalances] = useState<VendorBalance[]>([]);
  const [providerBalances, setProviderBalances] = useState<ProviderBalance[]>([]);
  
  // 接班人
  const [receivers, setReceivers] = useState<ShiftReceiver[]>([]);
  const [newReceiverName, setNewReceiverName] = useState('');
  const [isAddReceiverDialogOpen, setIsAddReceiverDialogOpen] = useState(false);
  const [isManageReceiversDialogOpen, setIsManageReceiversDialogOpen] = useState(false);
  // 提交校验：未填写项高亮
  const [validationErrors, setValidationErrors] = useState<{
    receiver: boolean;
    vendors: Set<string>;
    providers: Set<string>;
  }>({ receiver: false, vendors: new Set(), providers: new Set() });
  const [editingReceiver, setEditingReceiver] = useState<ShiftReceiver | null>(null);
  const [editReceiverName, setEditReceiverName] = useState('');
  const [isEditReceiverDialogOpen, setIsEditReceiverDialogOpen] = useState(false);
  const [deletingReceiver, setDeletingReceiver] = useState<ShiftReceiver | null>(null);
  const [isDeleteReceiverDialogOpen, setIsDeleteReceiverDialogOpen] = useState(false);
  
  // Smart refresh refs for typing-aware updates
  const pendingRefreshRef = useRef(false);
  const refreshCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // 🔧 只刷新余额数据，保留用户输入值
  const refreshBalancesOnly = useCallback(async () => {
    try {
      await forceRefreshSettlementCache();
      const [normalOrders, usdtOrders] = (effectiveTenantId && !useMyTenantRpc)
        ? await Promise.all([getTenantOrdersFull(effectiveTenantId), getTenantUsdtOrdersFull(effectiveTenantId)])
        : await Promise.all([getMyTenantOrdersFull(), getMyTenantUsdtOrdersFull()]);
      const ordersList = [...(normalOrders || []), ...(usdtOrders || [])].filter((o: any) => !o.is_deleted);
      const [vendorsList, providersList] = await Promise.all([
        listVendorsApi('active'),
        listPaymentProvidersApi('active'),
      ]);
      
      const cardSettlements = getCardMerchantSettlements();
      const providerSettlements = getPaymentProviderSettlements();
      
      const vendorResults = calculateAllVendorBalances(vendorsList, ordersList, cardSettlements);
      const providerResults = calculateAllProviderBalances(providersList, ordersList, providerSettlements);
      
      // 🔧 关键：只更新余额，保留现有输入值
      // 🔧 按数据库 sort_order 排序，不按余额排序
      setVendorBalances(prev => {
        const existingInputs = Object.fromEntries(prev.map(v => [v.vendorName, v.inputValue]));
        return vendorResults.map(v => ({
          vendorName: v.vendorName,
          balance: v.realTimeBalance,
          inputValue: existingInputs[v.vendorName] ?? getVendorInput(v.vendorName),
        }));
        // 不再按余额排序，保持数据库的 sort_order 顺序
      });
      
      // 🔧 按数据库 sort_order 排序，不按余额排序
      setProviderBalances(prev => {
        const existingInputs = Object.fromEntries(prev.map(p => [p.providerName, p.inputValue]));
        return providerResults.map(p => ({
          providerName: p.providerName,
          balance: p.realTimeBalance,
          inputValue: existingInputs[p.providerName] ?? getProviderInput(p.providerName),
        }));
        // 不再按余额排序，保持数据库的 sort_order 顺序
      });
      
      // 更新缓存（只存储余额数据，不包含输入值）
      balanceDataCache = {
        vendorBalances: vendorResults.map(v => ({ vendorName: v.vendorName, balance: v.realTimeBalance })),
        providerBalances: providerResults.map(p => ({ providerName: p.providerName, balance: p.realTimeBalance })),
        receivers,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('[ShiftHandover] Failed to refresh balances:', error);
    }
  }, [getVendorInput, getProviderInput, receivers, effectiveTenantId, useMyTenantRpc]);
  
  // 🔧 加载数据 - 支持缓存和强制刷新
  const loadData = useCallback(async (forceRefresh = false) => {
    // 🔧 关键修复：如果缓存有效且不是强制刷新，使用缓存数据
    if (!forceRefresh && isCacheValid() && balanceDataCache) {
      setVendorBalances(balanceDataCache.vendorBalances.map(v => ({
        ...v,
        inputValue: getVendorInput(v.vendorName),
      })));
      setProviderBalances(balanceDataCache.providerBalances.map(p => ({
        ...p,
        inputValue: getProviderInput(p.providerName),
      })));
      setReceivers(balanceDataCache.receivers);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      // 始终强制刷新结算缓存，确保拿到数据库中最新的初始余额/充值/提款数据
      // initializeSettlementCache 有 cacheInitialized 守卫，可能跳过 DB 读取导致数据过期
      try {
        await forceRefreshSettlementCache();
      } catch (e) {
        console.warn('[ShiftHandover] Settlement cache refresh failed, using defaults:', e);
      }
      
      // 并行加载所有数据源，每个独立容错
      const [ordersResult, vendorsResult, providersResult, receiversResult] = await Promise.allSettled([
        (effectiveTenantId && !useMyTenantRpc)
          ? Promise.all([getTenantOrdersFull(effectiveTenantId), getTenantUsdtOrdersFull(effectiveTenantId)])
          : Promise.all([getMyTenantOrdersFull(), getMyTenantUsdtOrdersFull()]),
        listVendorsApi('active'),
        listPaymentProvidersApi('active'),
        getShiftReceivers(),
      ]);
      
      const [normalOrders, usdtOrders] = ordersResult.status === 'fulfilled' ? ordersResult.value : [[], []];
      const ordersList = [...(normalOrders || []), ...(usdtOrders || [])].filter((o: any) => !o.is_deleted);
      const vendorsList = vendorsResult.status === 'fulfilled' ? vendorsResult.value : [];
      const providersList = providersResult.status === 'fulfilled' ? providersResult.value : [];
      const receiversData = receiversResult.status === 'fulfilled' ? receiversResult.value : [];
      
      if (ordersResult.status === 'rejected') console.error('[ShiftHandover] Orders fetch failed:', ordersResult.reason);
      if (vendorsResult.status === 'rejected') console.error('[ShiftHandover] Vendors fetch failed:', vendorsResult.reason);
      if (providersResult.status === 'rejected') console.error('[ShiftHandover] Providers fetch failed:', providersResult.reason);
      
      setReceivers(receiversData);
      
      const cardSettlements = getCardMerchantSettlements();
      const providerSettlements = getPaymentProviderSettlements();
      
      const vendorResults: VendorBalanceResult[] = calculateAllVendorBalances(
        vendorsList,
        ordersList,
        cardSettlements
      );
      
      const providerResults: ProviderBalanceResult[] = calculateAllProviderBalances(
        providersList,
        ordersList,
        providerSettlements
      );
      
      const vendorBalanceData: VendorBalance[] = vendorResults.map(v => ({
        vendorName: v.vendorName,
        balance: v.realTimeBalance,
        inputValue: getVendorInput(v.vendorName),
      }));
      
      const providerBalanceData: ProviderBalance[] = providerResults.map(p => ({
        providerName: p.providerName,
        balance: p.realTimeBalance,
        inputValue: getProviderInput(p.providerName),
      }));
      
      setVendorBalances(vendorBalanceData);
      setProviderBalances(providerBalanceData);
      
      balanceDataCache = {
        vendorBalances: vendorResults.map(v => ({ vendorName: v.vendorName, balance: v.realTimeBalance })),
        providerBalances: providerResults.map(p => ({ providerName: p.providerName, balance: p.realTimeBalance })),
        receivers: receiversData,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Failed to load shift handover data:', error);
      notify.error(t('加载数据失败', 'Failed to load data'));
    } finally {
      setLoading(false);
    }
  }, [t, getVendorInput, getProviderInput, effectiveTenantId, useMyTenantRpc]);
  
  // 🔧 Smart refresh - 只刷新余额，不清空输入
  const smartRefresh = useCallback(() => {
    if (isUserTyping()) {
      pendingRefreshRef.current = true;
      if (!refreshCheckIntervalRef.current) {
        refreshCheckIntervalRef.current = setInterval(() => {
          if (!isUserTyping() && pendingRefreshRef.current) {
            pendingRefreshRef.current = false;
            refreshBalancesOnly(); // 🔧 改为只刷新余额
            if (refreshCheckIntervalRef.current) {
              clearInterval(refreshCheckIntervalRef.current);
              refreshCheckIntervalRef.current = null;
            }
          }
        }, 500);
      }
    } else {
      refreshBalancesOnly(); // 🔧 改为只刷新余额
    }
  }, [refreshBalancesOnly]);
  
  // 🔧 关键修复：等待持久化数据加载完成后再执行 loadData
  useEffect(() => {
    if (isFormLoading) {
      return;
    }
    loadData(false);
  }, [loadData, isFormLoading]);
  
  // 监听结算数据变化事件，使模块级缓存失效并触发刷新
  useEffect(() => {
    const handleSettlementChange = () => {
      invalidateShiftHandoverCache();
      smartRefresh();
    };
    window.addEventListener('settlement-data-changed', handleSettlementChange);
    window.addEventListener('data-refresh:shared_data_store', handleSettlementChange);
    window.addEventListener('data-refresh:orders', handleSettlementChange);
    window.addEventListener('data-refresh:ledger_transactions', handleSettlementChange);
    return () => {
      window.removeEventListener('settlement-data-changed', handleSettlementChange);
      window.removeEventListener('data-refresh:shared_data_store', handleSettlementChange);
      window.removeEventListener('data-refresh:orders', handleSettlementChange);
      window.removeEventListener('data-refresh:ledger_transactions', handleSettlementChange);
    };
  }, [smartRefresh]);
  
  // 轮询替代 Realtime 订阅：每 30 秒刷新余额
  useEffect(() => {
    const timer = setInterval(() => {
      smartRefresh();
    }, 30000);
    
    return () => {
      clearInterval(timer);
      if (refreshCheckIntervalRef.current) {
        clearInterval(refreshCheckIntervalRef.current);
      }
    };
  }, [smartRefresh]);
  
  // 🔧 手动刷新按钮 - 强制刷新余额但保留输入
  const handleRefresh = async () => {
    await refreshBalancesOnly();
    notify.success(t('数据已刷新', 'Data refreshed'));
  };

  /** 将「系统余额为 0」且手填仍为空的卡商/代付行一键写入 0，便于通过交班校验 */
  const handleOneClickFillZeroBalances = () => {
    const vendorNames: string[] = [];
    const providerNames: string[] = [];
    for (const v of vendorBalances) {
      if (v.balance === 0 && !isFilledBalanceInput(v.inputValue)) vendorNames.push(v.vendorName);
    }
    for (const p of providerBalances) {
      if (p.balance === 0 && !isFilledBalanceInput(p.inputValue)) providerNames.push(p.providerName);
    }
    for (const name of vendorNames) setVendorInput(name, '0');
    for (const name of providerNames) setProviderInput(name, '0');
    if (vendorNames.length > 0) {
      setVendorBalances((prev) =>
        prev.map((v) =>
          v.balance === 0 && !isFilledBalanceInput(v.inputValue) ? { ...v, inputValue: '0' } : v,
        ),
      );
    }
    if (providerNames.length > 0) {
      setProviderBalances((prev) =>
        prev.map((p) =>
          p.balance === 0 && !isFilledBalanceInput(p.inputValue) ? { ...p, inputValue: '0' } : p,
        ),
      );
    }
    const n = vendorNames.length + providerNames.length;
    if (n > 0) {
      setValidationErrors((prev) => {
        const nextV = new Set(prev.vendors);
        const nextP = new Set(prev.providers);
        vendorNames.forEach((name) => nextV.delete(name));
        providerNames.forEach((name) => nextP.delete(name));
        return { ...prev, vendors: nextV, providers: nextP };
      });
      notify.success(
        t(`已一键填入 ${n} 处余额为 0 的商家`, `Filled ${n} zero-balance merchant row(s)`),
      );
    } else {
      notify.message(
        t(
          '没有可填入项：仅处理「系统显示余额为 0」且手填仍为空的卡商/代付商家。',
          'Nothing to fill: only rows with system balance 0 and an empty handover input.',
        ),
      );
    }
  };

  const oneClickFillTooltip = t(
    '一键填入余额是0的商家余额',
    'One-click fill 0 for card merchants and payment providers whose system balance is 0.',
  );

  const renderOneClickFillButton = () => (
    <div className="inline-flex h-8 items-stretch overflow-hidden rounded-md border border-input bg-background text-sm font-medium shadow-sm ring-offset-background hover:bg-accent/40">
      <button
        type="button"
        className="px-2.5 outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
        onClick={handleOneClickFillZeroBalances}
      >
        {t('一键填入', 'One-click fill')}
      </button>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex h-full items-center border-l border-input px-1.5 text-muted-foreground outline-none transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={oneClickFillTooltip}
            >
              <CircleHelp className="h-3.5 w-3.5 shrink-0" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-[280px] text-xs">
            {oneClickFillTooltip}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
  
  // 更新卡商输入值（同时持久化）
  const handleVendorInputChange = (vendorName: string, value: string) => {
    setVendorInput(vendorName, value);
    setVendorBalances(prev => 
      prev.map(v => v.vendorName === vendorName ? { ...v, inputValue: value } : v)
    );
  };
  
  // 更新代付商家输入值（同时持久化）
  const handleProviderInputChange = (providerName: string, value: string) => {
    setProviderInput(providerName, value);
    setProviderBalances(prev => 
      prev.map(p => p.providerName === providerName ? { ...p, inputValue: value } : p)
    );
  };
  
  // 添加新接班人（使用当前员工ID）
  const handleAddReceiver = async () => {
    if (!newReceiverName.trim()) {
      notify.error(t('请输入接班人姓名', 'Please enter receiver name'));
      return;
    }
    
    const receiver = await addShiftReceiver(newReceiverName, employee?.id);
    if (receiver) {
      setReceivers(prev => [...prev, receiver]);
      setSelectedReceiver(receiver.name);
      setNewReceiverName('');
      setIsAddReceiverDialogOpen(false);
      notify.success(t('添加成功', 'Added successfully'));
    } else {
      notify.error(t('添加失败，可能已存在同名接班人', 'Failed to add, receiver may already exist'));
    }
  };
  
  // 开始编辑接班人
  const handleStartEditReceiver = (receiver: ShiftReceiver) => {
    setEditingReceiver(receiver);
    setEditReceiverName(receiver.name);
    setIsEditReceiverDialogOpen(true);
  };
  
  // 保存编辑接班人
  const handleSaveEditReceiver = async () => {
    if (!editingReceiver || !editReceiverName.trim()) {
      notify.error(t('请输入接班人姓名', 'Please enter receiver name'));
      return;
    }
    
    const updated = await updateShiftReceiver(editingReceiver.id, editReceiverName);
    if (updated) {
      setReceivers(prev => prev.map(r => r.id === updated.id ? updated : r));
      if (selectedReceiver === editingReceiver.name) {
        setSelectedReceiver(updated.name);
      }
      setIsEditReceiverDialogOpen(false);
      setEditingReceiver(null);
      notify.success(t('修改成功', 'Updated successfully'));
    } else {
      notify.error(t('修改失败', 'Failed to update'));
    }
  };
  
  // 开始删除接班人
  const handleStartDeleteReceiver = (receiver: ShiftReceiver) => {
    setDeletingReceiver(receiver);
    setIsDeleteReceiverDialogOpen(true);
  };
  
  // 确认删除接班人
  const handleConfirmDeleteReceiver = async () => {
    if (!deletingReceiver) return;
    
    const success = await deleteShiftReceiver(deletingReceiver.id);
    if (success) {
      setReceivers(prev => prev.filter(r => r.id !== deletingReceiver.id));
      if (selectedReceiver === deletingReceiver.name) {
        setSelectedReceiver('');
      }
      setIsDeleteReceiverDialogOpen(false);
      setDeletingReceiver(null);
      notify.success(t('删除成功', 'Deleted successfully'));
    } else {
      notify.error(t('删除失败', 'Failed to delete'));
    }
  };
  
  // 提交交班记录
  const handleSubmit = async () => {
    const missingLines: string[] = [];
    const errVendors = new Set<string>();
    const errProviders = new Set<string>();
    let errReceiver = false;

    if (!String(selectedReceiver || "").trim()) {
      errReceiver = true;
      missingLines.push(t("接班人：请选择接班人", "Receiver: please select a successor"));
    }

    for (const v of vendorBalances) {
      if (!isFilledBalanceInput(v.inputValue)) {
        errVendors.add(v.vendorName);
      }
    }
    if (errVendors.size > 0) {
      const names = Array.from(errVendors).map((n) => `「${n}」`).join("、");
      missingLines.push(
        t(`卡商结算余额未填写：${names}`, `Card merchant balance missing: ${names}`),
      );
    }

    for (const p of providerBalances) {
      if (!isFilledBalanceInput(p.inputValue)) {
        errProviders.add(p.providerName);
      }
    }
    if (errProviders.size > 0) {
      const names = Array.from(errProviders).map((n) => `「${n}」`).join("、");
      missingLines.push(
        t(`代付商家余额未填写：${names}`, `Payment provider balance missing: ${names}`),
      );
    }

    setValidationErrors({ receiver: errReceiver, vendors: errVendors, providers: errProviders });

    if (missingLines.length > 0) {
      notify.error(
        t("以下内容未填写，请完善后再提交", "Please fill in the following before submitting"),
        {
          description: missingLines.map((l) => `• ${l}`).join("\n"),
          duration: 12_000,
          style: { whiteSpace: "pre-line" },
        },
      );
      return;
    }

    setSubmitting(true);
    try {
      const cardMerchantData: CardMerchantHandoverData[] = vendorBalances.map((v) => ({
        vendorName: v.vendorName,
        balance: v.balance,
        inputValue: Number(v.inputValue.trim()),
      }));

      const paymentProviderData: PaymentProviderHandoverData[] = providerBalances.map((p) => ({
        providerName: p.providerName,
        balance: p.balance,
        inputValue: Number(p.inputValue.trim()),
      }));
      
      const result = await createShiftHandover(
        employee?.id || null,
        employee?.real_name || t('未知', 'Unknown'),
        selectedReceiver,
        cardMerchantData,
        paymentProviderData,
        remark
      );
      
      if (result) {
        notify.success(t('交班记录已提交', 'Shift handover submitted'));
        clearPersistedForm();
        setVendorBalances(prev => prev.map(v => ({ ...v, inputValue: '' })));
        setProviderBalances(prev => prev.map(p => ({ ...p, inputValue: '' })));
        setValidationErrors({ receiver: false, vendors: new Set(), providers: new Set() });
        invalidateShiftHandoverCache();
      } else {
        notify.error(t('提交失败', 'Failed to submit'));
      }
    } catch (error) {
      console.error('Failed to submit shift handover:', error);
      notify.error(t('提交失败', 'Failed to submit'));
    } finally {
      setSubmitting(false);
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      {/* 顶部工具栏 - 交班信息 */}
      <div className={`${isMobile ? 'flex flex-col gap-2' : 'flex flex-wrap items-center gap-3'} p-3 bg-muted/30 rounded-lg border`}>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground whitespace-nowrap">{t('交班人', 'Handover')}:</Label>
          <span className="font-medium text-sm">{employee?.real_name || '-'}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Label className="text-sm text-muted-foreground whitespace-nowrap">{t('接班人', 'Receiver')}:<span className="text-destructive">*</span></Label>
          <Select value={selectedReceiver} onValueChange={(v) => {
            setSelectedReceiver(v);
            if (v) setValidationErrors(prev => ({ ...prev, receiver: false }));
          }}>
            <SelectTrigger className={`${isMobile ? 'flex-1' : 'w-28'} h-8 ${validationErrors.receiver ? 'border-destructive ring-1 ring-destructive' : ''}`}>
              <SelectValue placeholder={t('选择', 'Select')} />
            </SelectTrigger>
            <SelectContent>
              {receivers.map(r => (
                <SelectItem key={r.id} value={r.name}>
                  {r.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            variant="outline" 
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsAddReceiverDialogOpen(true)}
            title={t('添加接班人', 'Add Receiver')}
          >
            <UserPlus className="h-3.5 w-3.5" />
          </Button>
          <Button 
            variant="outline" 
            size="icon"
            className="h-8 w-8"
            onClick={() => setIsManageReceiversDialogOpen(true)}
            title={t('管理接班人', 'Manage Receivers')}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          {isMobile && (
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              {renderOneClickFillButton()}
              <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1 h-8">
                <RefreshCw className="h-3 w-3" />
                {t('刷新', 'Refresh')}
              </Button>
            </div>
          )}
        </div>
        {!isMobile && (
          <div className="ml-auto flex items-center gap-2">
            {renderOneClickFillButton()}
            <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1 h-8">
              <RefreshCw className="h-3 w-3" />
              {t('刷新', 'Refresh')}
            </Button>
          </div>
        )}
      </div>
      
      {/* 商家余额汇总 - 合并卡商和代付 */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-base">{t('商家余额汇总', 'Merchant Balance Summary')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {/* 卡商结算余额 */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">{t('卡商结算余额', 'Card Merchant Balances')}</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {vendorBalances.map(v => {
                const hasError = validationErrors.vendors.has(v.vendorName);
                return (
                  <div key={v.vendorName} className={`border rounded p-1.5 text-center hover:bg-muted/50 transition-colors ${hasError ? 'border-destructive bg-destructive/5' : ''}`}>
                    <div className="text-[11px] font-medium text-muted-foreground truncate" title={v.vendorName}>
                      {v.vendorName}
                    </div>
                    <div className="text-sm font-bold text-primary leading-tight my-0.5">
                      {safeToFixed(v.balance, 2)}
                    </div>
                    <div className="flex gap-1 items-center">
                      <Input
                        type="number"
                        placeholder={hasError ? t('必填', 'Required') : t('填写', 'Fill')}
                        value={v.inputValue}
                        onChange={e => {
                          handleVendorInputChange(v.vendorName, e.target.value);
                          if (e.target.value.trim()) {
                            setValidationErrors(prev => {
                              const next = new Set(prev.vendors);
                              next.delete(v.vendorName);
                              return { ...prev, vendors: next };
                            });
                          }
                        }}
                        className={`h-8 text-xs flex-1 ${hasError ? 'border-destructive placeholder:text-destructive' : ''}`}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 shrink-0 text-xs font-medium"
                        onClick={() => {
                          handleVendorInputChange(v.vendorName, v.balance.toFixed(2));
                          setValidationErrors(prev => {
                            const next = new Set(prev.vendors);
                            next.delete(v.vendorName);
                            return { ...prev, vendors: next };
                          });
                        }}
                        title={t('一键填入', 'Fill')}
                      >
                        {t('填入', 'Fill')}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          
          {/* 分隔线 */}
          <div className="border-t" />
          
          {/* 代付商家余额 */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">{t('代付商家余额', 'Payment Provider Balances')}</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {providerBalances.map(p => {
                const hasError = validationErrors.providers.has(p.providerName);
                return (
                  <div key={p.providerName} className={`border rounded p-1.5 text-center hover:bg-muted/50 transition-colors ${hasError ? 'border-destructive bg-destructive/5' : ''}`}>
                    <div className="text-[11px] font-medium text-muted-foreground truncate" title={p.providerName}>
                      {p.providerName}
                    </div>
                    <div className="text-sm font-bold text-primary leading-tight my-0.5">
                      {safeToFixed(p.balance, 2)}
                    </div>
                    <div className="flex gap-1 items-center">
                      <Input
                        type="number"
                        placeholder={hasError ? t('必填', 'Required') : t('填写', 'Fill')}
                        value={p.inputValue}
                        onChange={e => {
                          handleProviderInputChange(p.providerName, e.target.value);
                          if (e.target.value.trim()) {
                            setValidationErrors(prev => {
                              const next = new Set(prev.providers);
                              next.delete(p.providerName);
                              return { ...prev, providers: next };
                            });
                          }
                        }}
                        className={`h-8 text-xs flex-1 ${hasError ? 'border-destructive placeholder:text-destructive' : ''}`}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 px-3 shrink-0 text-xs font-medium"
                        onClick={() => {
                          handleProviderInputChange(p.providerName, p.balance.toFixed(2));
                          setValidationErrors(prev => {
                            const next = new Set(prev.providers);
                            next.delete(p.providerName);
                            return { ...prev, providers: next };
                          });
                        }}
                        title={t('一键填入', 'Fill')}
                      >
                        {t('填入', 'Fill')}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* 备注和提交 - 紧凑布局 */}
      <div className={`${isMobile ? 'flex flex-col gap-2' : 'flex flex-wrap items-end gap-3'} p-3 bg-muted/30 rounded-lg border`}>
        <div className={`${isMobile ? 'w-full' : 'flex-1 min-w-[200px]'}`}>
          <Label className="text-xs text-muted-foreground">{t('备注', 'Remark')}</Label>
          <Textarea
            placeholder={t('可选备注', 'Optional remark')}
            value={remark}
            onChange={e => setRemark(e.target.value)}
            rows={1}
            className="resize-none min-h-[32px]"
          />
        </div>
        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className={`gap-1 ${isMobile ? 'w-full' : ''}`}
          title={t("提交前将校验接班人与全部商家余额填写项", "Validates receiver and all balance fields")}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {t('提交交班记录', 'Submit Handover')}
        </Button>
      </div>
      
      <DrawerDetail
        open={isAddReceiverDialogOpen}
        onOpenChange={setIsAddReceiverDialogOpen}
        title={t('添加接班人', 'Add Receiver')}
        sheetMaxWidth="xl"
      >
          <div className="space-y-2">
            <Label>{t('姓名', 'Name')}</Label>
            <Input
              value={newReceiverName}
              onChange={e => setNewReceiverName(e.target.value)}
              placeholder={t('输入接班人姓名', 'Enter receiver name')}
              onKeyDown={e => e.key === 'Enter' && handleAddReceiver()}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button variant="outline" onClick={() => setIsAddReceiverDialogOpen(false)}>
              {t('取消', 'Cancel')}
            </Button>
            <Button onClick={handleAddReceiver}>
              <Plus className="h-4 w-4 mr-1" />
              {t('添加', 'Add')}
            </Button>
          </div>
      </DrawerDetail>

      <DrawerDetail
        open={isManageReceiversDialogOpen}
        onOpenChange={setIsManageReceiversDialogOpen}
        title={t('管理接班人', 'Manage Receivers')}
        sheetMaxWidth="xl"
      >
          <div className="max-h-[min(400px,50vh)] overflow-y-auto">
            {receivers.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                {t('暂无接班人，请先添加', 'No receivers yet')}
              </div>
            ) : (
              <div className="space-y-2">
                {receivers.map(r => (
                  <div key={r.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <span>{r.name}</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleStartEditReceiver(r)}>
                        <Pencil className="h-3 w-3 mr-1" />
                        {t('编辑', 'Edit')}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleStartDeleteReceiver(r)}>
                        <Trash2 className="h-3 w-3 mr-1" />
                        {t('删除', 'Delete')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-end pt-4 mt-4 border-t border-border">
            <Button variant="outline" onClick={() => setIsManageReceiversDialogOpen(false)}>
              {t('关闭', 'Close')}
            </Button>
          </div>
      </DrawerDetail>

      <DrawerDetail
        open={isEditReceiverDialogOpen}
        onOpenChange={setIsEditReceiverDialogOpen}
        title={t('编辑接班人', 'Edit Receiver')}
        sheetMaxWidth="xl"
      >
          <div className="space-y-2">
            <Label>{t('姓名', 'Name')}</Label>
            <Input
              value={editReceiverName}
              onChange={e => setEditReceiverName(e.target.value)}
              placeholder={t('输入接班人姓名', 'Enter receiver name')}
              onKeyDown={e => e.key === 'Enter' && handleSaveEditReceiver()}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button variant="outline" onClick={() => setIsEditReceiverDialogOpen(false)}>
              {t('取消', 'Cancel')}
            </Button>
            <Button onClick={handleSaveEditReceiver}>
              {t('保存', 'Save')}
            </Button>
          </div>
      </DrawerDetail>
      
      {/* 删除接班人确认对话框 */}
      <AlertDialog open={isDeleteReceiverDialogOpen} onOpenChange={setIsDeleteReceiverDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('确认删除', 'Confirm Delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('确定要删除接班人', 'Are you sure you want to delete')} "{deletingReceiver?.name}"？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('取消', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteReceiver} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('删除', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
