// ============= 交班对账Tab组件 =============
// 在汇率计算页面使用，显示商家余额并提交交班记录
// 余额计算逻辑与商家结算页面完全一致（共享计算服务）
// 🔧 修复：等待持久化数据加载后再执行loadData + 模块级缓存 + 分离余额刷新

import { useState, useEffect, useCallback, useRef } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Send, Loader2, UserPlus, RefreshCw, Pencil, Trash2 } from 'lucide-react';
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
import { supabase } from '@/integrations/supabase/client';
import { getMyTenantOrdersFull, getMyTenantUsdtOrdersFull, getTenantOrdersFull, getTenantUsdtOrdersFull } from '@/services/tenantService';
import { safeToFixed } from '@/lib/safeCalc';
import { isUserTyping, trackRender } from '@/lib/performanceUtils';
import {
  getCardMerchantSettlements,
  getPaymentProviderSettlements,
  initializeSettlementCache,
  forceRefreshSettlementCache,
} from '@/stores/merchantSettlementStore';
import { toast } from 'sonner';
import {
  getShiftReceivers,
  addShiftReceiver,
  updateShiftReceiver,
  deleteShiftReceiver,
  createShiftHandover,
  CardMerchantHandoverData,
  PaymentProviderHandoverData,
  ShiftReceiver,
} from '@/stores/shiftHandoverStore';
import {
  calculateAllVendorBalances,
  calculateAllProviderBalances,
  VendorBalanceResult,
  ProviderBalanceResult,
} from '@/services/settlementCalculationService';
import { useShiftHandoverFormPersistence } from '@/hooks/useShiftHandoverFormPersistence';

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
      const [vendorsRes, providersRes] = await Promise.all([
        supabase.from('vendors').select('id, name, status').eq('status', 'active').order('sort_order', { ascending: true }),
        supabase.from('payment_providers').select('id, name, status').eq('status', 'active').order('sort_order', { ascending: true }),
      ]);
      const vendorsList = vendorsRes.data || [];
      const providersList = providersRes.data || [];
      
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
      
      console.log('[ShiftHandover] Balances refreshed (inputs preserved)');
    } catch (error) {
      console.error('[ShiftHandover] Failed to refresh balances:', error);
    }
  }, [getVendorInput, getProviderInput, receivers, effectiveTenantId, useMyTenantRpc]);
  
  // 🔧 加载数据 - 支持缓存和强制刷新
  const loadData = useCallback(async (forceRefresh = false) => {
    // 🔧 关键修复：如果缓存有效且不是强制刷新，使用缓存数据
    if (!forceRefresh && isCacheValid() && balanceDataCache) {
      console.log('[ShiftHandover] Using cached data');
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
      // 初始化结算缓存（强制刷新时从数据库重新加载）
      if (forceRefresh) {
        await forceRefreshSettlementCache();
      } else {
        await initializeSettlementCache();
      }
      
      const [normalOrders, usdtOrders] = (effectiveTenantId && !useMyTenantRpc)
        ? await Promise.all([getTenantOrdersFull(effectiveTenantId), getTenantUsdtOrdersFull(effectiveTenantId)])
        : await Promise.all([getMyTenantOrdersFull(), getMyTenantUsdtOrdersFull()]);
      const ordersList = [...(normalOrders || []), ...(usdtOrders || [])].filter((o: any) => !o.is_deleted);
      const [vendorsRes, providersRes, receiversData] = await Promise.all([
        supabase.from('vendors').select('id, name, status').eq('status', 'active').order('sort_order', { ascending: true }),
        supabase.from('payment_providers').select('id, name, status').eq('status', 'active').order('sort_order', { ascending: true }),
        getShiftReceivers(),
      ]);
      const vendorsList = vendorsRes.data || [];
      const providersList = providersRes.data || [];
      
      setReceivers(receiversData);
      
      // 重新获取结算缓存（确保使用最新数据）
      const cardSettlements = getCardMerchantSettlements();
      const providerSettlements = getPaymentProviderSettlements();
      
      console.log('[ShiftHandover] Loading fresh data');
      console.log('[ShiftHandover] Vendors:', vendorsList.length, 'Providers:', providersList.length, 'Orders:', ordersList.length);
      
      // 使用共享计算服务计算卡商余额
      const vendorResults: VendorBalanceResult[] = calculateAllVendorBalances(
        vendorsList,
        ordersList,
        cardSettlements
      );
      
      // 使用共享计算服务计算代付商家余额
      const providerResults: ProviderBalanceResult[] = calculateAllProviderBalances(
        providersList,
        ordersList,
        providerSettlements
      );
      
      // 🔧 转换为组件内部格式，从持久化状态恢复输入值
      // 🔧 按数据库 sort_order 排序，不按余额排序
      const vendorBalanceData: VendorBalance[] = vendorResults.map(v => ({
        vendorName: v.vendorName,
        balance: v.realTimeBalance,
        inputValue: getVendorInput(v.vendorName),
      }));
      // 不再按余额排序，保持数据库的 sort_order 顺序
      
      const providerBalanceData: ProviderBalance[] = providerResults.map(p => ({
        providerName: p.providerName,
        balance: p.realTimeBalance,
        inputValue: getProviderInput(p.providerName),
      }));
      // 不再按余额排序，保持数据库的 sort_order 顺序
      
      setVendorBalances(vendorBalanceData);
      setProviderBalances(providerBalanceData);
      
      // 🔧 更新模块级缓存
      balanceDataCache = {
        vendorBalances: vendorResults.map(v => ({ vendorName: v.vendorName, balance: v.realTimeBalance })),
        providerBalances: providerResults.map(p => ({ providerName: p.providerName, balance: p.realTimeBalance })),
        receivers: receiversData,
        timestamp: Date.now(),
      };
    } catch (error) {
      console.error('Failed to load shift handover data:', error);
      toast.error(t('加载数据失败', 'Failed to load data'));
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
      console.log('[ShiftHandover] Waiting for form persistence to load...');
      return;
    }
    loadData(false);
  }, [loadData, isFormLoading]);
  
  // 订阅多个表的实时变化：订单、赠送、结算数据
  useEffect(() => {
    const ordersChannel = supabase
      .channel('shift-handover-orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        (payload) => {
          console.log('[ShiftHandover] Order changed, smart refreshing balances...', payload.eventType);
          smartRefresh();
        }
      )
      .subscribe();
    
    // 订阅活动赠送变化
    const giftsChannel = supabase
      .channel('shift-handover-gifts')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'activity_gifts',
        },
        (payload) => {
          console.log('[ShiftHandover] Gift changed, smart refreshing balances...', payload.eventType);
          smartRefresh();
        }
      )
      .subscribe();
    
    // 订阅结算数据变化（shared_data_store）
    const settlementsChannel = supabase
      .channel('shift-handover-settlements')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shared_data_store',
          filter: 'data_key=in.(cardMerchantSettlements,paymentProviderSettlements)',
        },
        (payload) => {
          console.log('[ShiftHandover] Settlement changed, force refreshing cache...', payload.eventType);
          // 结算数据变化时必须强制刷新缓存，确保多用户同步
          forceRefreshSettlementCache().then(() => {
            smartRefresh();
          });
        }
      )
      .subscribe();
    
    return () => {
      supabase.removeChannel(ordersChannel);
      supabase.removeChannel(giftsChannel);
      supabase.removeChannel(settlementsChannel);
      if (refreshCheckIntervalRef.current) {
        clearInterval(refreshCheckIntervalRef.current);
      }
    };
  }, [smartRefresh]);
  
  // 🔧 手动刷新按钮 - 强制刷新余额但保留输入
  const handleRefresh = async () => {
    await refreshBalancesOnly();
    toast.success(t('数据已刷新', 'Data refreshed'));
  };
  
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
      toast.error(t('请输入接班人姓名', 'Please enter receiver name'));
      return;
    }
    
    const receiver = await addShiftReceiver(newReceiverName, employee?.id);
    if (receiver) {
      setReceivers(prev => [...prev, receiver]);
      setSelectedReceiver(receiver.name);
      setNewReceiverName('');
      setIsAddReceiverDialogOpen(false);
      toast.success(t('添加成功', 'Added successfully'));
    } else {
      toast.error(t('添加失败，可能已存在同名接班人', 'Failed to add, receiver may already exist'));
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
      toast.error(t('请输入接班人姓名', 'Please enter receiver name'));
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
      toast.success(t('修改成功', 'Updated successfully'));
    } else {
      toast.error(t('修改失败', 'Failed to update'));
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
      toast.success(t('删除成功', 'Deleted successfully'));
    } else {
      toast.error(t('删除失败', 'Failed to delete'));
    }
  };
  
  // 提交交班记录
  const handleSubmit = async () => {
    if (!selectedReceiver) {
      toast.error(t('请选择接班人', 'Please select a receiver'));
      return;
    }
    
    setSubmitting(true);
    try {
      const cardMerchantData: CardMerchantHandoverData[] = vendorBalances.map(v => ({
        vendorName: v.vendorName,
        balance: v.balance,
        inputValue: parseFloat(v.inputValue) || 0,
      }));
      
      const paymentProviderData: PaymentProviderHandoverData[] = providerBalances.map(p => ({
        providerName: p.providerName,
        balance: p.balance,
        inputValue: parseFloat(p.inputValue) || 0,
      }));
      
      const result = await createShiftHandover(
        employee?.id || null,
        employee?.real_name || '未知',
        selectedReceiver,
        cardMerchantData,
        paymentProviderData,
        remark
      );
      
      if (result) {
        toast.success(t('交班记录已提交', 'Shift handover submitted'));
        // 清空输入（包括持久化数据）
        clearPersistedForm();
        setVendorBalances(prev => prev.map(v => ({ ...v, inputValue: '' })));
        setProviderBalances(prev => prev.map(p => ({ ...p, inputValue: '' })));
        // 🔧 提交成功后使缓存失效，下次进入时加载最新数据
        invalidateShiftHandoverCache();
      } else {
        toast.error(t('提交失败', 'Failed to submit'));
      }
    } catch (error) {
      console.error('Failed to submit shift handover:', error);
      toast.error(t('提交失败', 'Failed to submit'));
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
          <Label className="text-sm text-muted-foreground whitespace-nowrap">{t('接班人', 'Receiver')}:</Label>
          <Select value={selectedReceiver} onValueChange={setSelectedReceiver}>
            <SelectTrigger className={`${isMobile ? 'flex-1' : 'w-28'} h-8`}>
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
            <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-1 h-8 ml-auto">
              <RefreshCw className="h-3 w-3" />
              {t('刷新', 'Refresh')}
            </Button>
          )}
        </div>
        {!isMobile && (
          <div className="ml-auto">
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
              {vendorBalances.map(v => (
                <div key={v.vendorName} className="border rounded p-1.5 text-center hover:bg-muted/50 transition-colors">
                  <div className="text-[11px] font-medium text-muted-foreground truncate" title={v.vendorName}>
                    {v.vendorName}
                  </div>
                  <div className="text-sm font-bold text-primary leading-tight my-0.5">
                    {safeToFixed(v.balance, 2)}
                  </div>
                  <div className="flex gap-0.5 items-center">
                    <Input
                      type="number"
                      placeholder={t('填写', 'Fill')}
                      value={v.inputValue}
                      onChange={e => handleVendorInputChange(v.vendorName, e.target.value)}
                      className="h-6 text-xs flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 shrink-0 text-[10px]"
                      onClick={() => handleVendorInputChange(v.vendorName, v.balance.toFixed(2))}
                      title={t('一键填入', 'Fill')}
                    >
                      {t('填入', 'Fill')}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          {/* 分隔线 */}
          <div className="border-t" />
          
          {/* 代付商家余额 */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-2">{t('代付商家余额', 'Payment Provider Balances')}</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {providerBalances.map(p => (
                <div key={p.providerName} className="border rounded p-1.5 text-center hover:bg-muted/50 transition-colors">
                  <div className="text-[11px] font-medium text-muted-foreground truncate" title={p.providerName}>
                    {p.providerName}
                  </div>
                  <div className="text-sm font-bold text-primary leading-tight my-0.5">
                    {safeToFixed(p.balance, 2)}
                  </div>
                  <div className="flex gap-0.5 items-center">
                    <Input
                      type="number"
                      placeholder={t('填写', 'Fill')}
                      value={p.inputValue}
                      onChange={e => handleProviderInputChange(p.providerName, e.target.value)}
                      className="h-6 text-xs flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1.5 shrink-0 text-[10px]"
                      onClick={() => handleProviderInputChange(p.providerName, p.balance.toFixed(2))}
                      title={t('一键填入', 'Fill')}
                    >
                      {t('填入', 'Fill')}
                    </Button>
                  </div>
                </div>
              ))}
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
          disabled={submitting || !selectedReceiver}
          className={`gap-1 ${isMobile ? 'w-full' : ''}`}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {t('提交交班记录', 'Submit Handover')}
        </Button>
      </div>
      
      {/* 添加接班人对话框 */}
      <Dialog open={isAddReceiverDialogOpen} onOpenChange={setIsAddReceiverDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('添加接班人', 'Add Receiver')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label>{t('姓名', 'Name')}</Label>
            <Input
              value={newReceiverName}
              onChange={e => setNewReceiverName(e.target.value)}
              placeholder={t('输入接班人姓名', 'Enter receiver name')}
              onKeyDown={e => e.key === 'Enter' && handleAddReceiver()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddReceiverDialogOpen(false)}>
              {t('取消', 'Cancel')}
            </Button>
            <Button onClick={handleAddReceiver}>
              <Plus className="h-4 w-4 mr-1" />
              {t('添加', 'Add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* 管理接班人对话框 */}
      <Dialog open={isManageReceiversDialogOpen} onOpenChange={setIsManageReceiversDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{t('管理接班人', 'Manage Receivers')}</DialogTitle>
          </DialogHeader>
          <div className="py-4 max-h-[400px] overflow-y-auto">
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsManageReceiversDialogOpen(false)}>
              {t('关闭', 'Close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* 编辑接班人对话框 */}
      <Dialog open={isEditReceiverDialogOpen} onOpenChange={setIsEditReceiverDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>{t('编辑接班人', 'Edit Receiver')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label>{t('姓名', 'Name')}</Label>
            <Input
              value={editReceiverName}
              onChange={e => setEditReceiverName(e.target.value)}
              placeholder={t('输入接班人姓名', 'Enter receiver name')}
              onKeyDown={e => e.key === 'Enter' && handleSaveEditReceiver()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditReceiverDialogOpen(false)}>
              {t('取消', 'Cancel')}
            </Button>
            <Button onClick={handleSaveEditReceiver}>
              {t('保存', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
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
