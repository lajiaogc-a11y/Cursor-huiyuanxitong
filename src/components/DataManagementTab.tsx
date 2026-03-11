import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Database, Navigation, Save, Pencil, Check, Lock, Trash2, Loader2, Download, AlertTriangle, Bell } from "lucide-react";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { reversePointsOnOrderCancel } from '@/services/pointsService';
import DataExportImportTab from "./DataExportImportTab";
import MemoSettingsTab from "./MemoSettingsTab";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { isProductionLocked } from "@/stores/productionLockStore";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { logOperation } from "@/stores/auditLogStore";
import { queryClient } from "@/lib/queryClient";

// Navigation Config
interface NavigationConfig {
  navKey: string;
  displayTextZh: string;
  displayTextEn: string;
  sortOrder: number;
  isVisible: boolean;
}

const DEFAULT_NAV_CONFIG: NavigationConfig[] = [
  { navKey: "dashboard", displayTextZh: "数据统计", displayTextEn: "Statistics", sortOrder: 1, isVisible: true },
  { navKey: "exchangeRate", displayTextZh: "汇率计算", displayTextEn: "Exchange Rate", sortOrder: 2, isVisible: true },
  { navKey: "orders", displayTextZh: "订单管理", displayTextEn: "Orders", sortOrder: 3, isVisible: true },
  { navKey: "members", displayTextZh: "会员管理", displayTextEn: "Members", sortOrder: 4, isVisible: true },
  { navKey: "merchants", displayTextZh: "商家管理", displayTextEn: "Merchants", sortOrder: 5, isVisible: true },
  { navKey: "reports", displayTextZh: "报表管理", displayTextEn: "Reports", sortOrder: 6, isVisible: true },
  { navKey: "activity", displayTextZh: "活动积分", displayTextEn: "Activity Points", sortOrder: 7, isVisible: true },
  { navKey: "audit", displayTextZh: "审核中心", displayTextEn: "Audit Center", sortOrder: 8, isVisible: true },
  { navKey: "knowledge_base", displayTextZh: "公司文档", displayTextEn: "Company Docs", sortOrder: 9, isVisible: true },
  { navKey: "settings", displayTextZh: "系统设置", displayTextEn: "Settings", sortOrder: 10, isVisible: true },
];

// 从数据库加载导航配置
async function loadNavConfig(): Promise<NavigationConfig[]> {
  const { data } = await supabase.from('navigation_config').select('*').order('sort_order');
  if (data && data.length > 0) {
    return data.map(d => ({
      navKey: d.nav_key,
      displayTextZh: d.display_text_zh,
      displayTextEn: d.display_text_en,
      sortOrder: d.sort_order,
      isVisible: d.is_visible,
    }));
  }
  return DEFAULT_NAV_CONFIG;
}

// 保存导航配置到数据库
async function saveNavConfig(config: NavigationConfig[]): Promise<void> {
  for (const nav of config) {
    await supabase.from('navigation_config').upsert({
      nav_key: nav.navKey,
      display_text_zh: nav.displayTextZh,
      display_text_en: nav.displayTextEn,
      sort_order: nav.sortOrder,
      is_visible: nav.isVisible,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'nav_key' });
  }
}

export default function DataManagementTab() {
  const { t } = useLanguage();
  const { employee } = useAuth();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const [activeTab, setActiveTab] = useState("exportImport");
  
  const [navConfig, setNavConfig] = useState<NavigationConfig[]>([]);
  const [editingNav, setEditingNav] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [productionLocked, setProductionLocked] = useState(isProductionLocked());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ current: 0, total: 0, currentStep: '' });
  
  // 数据删除对话框状态
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteRetainMonths, setDeleteRetainMonths] = useState("1");
  const [deleteSelections, setDeleteSelections] = useState({
    orders: false,
    recycleActivityDataOnOrderDelete: false, // 删除订单时回收活动数据（累积次数、累积利润等）
    reports: {
      employee: false,
      card: false,
      vendor: false,
      daily: false,
    },
    members: {
      memberManagement: false,
      activityData: false,
      activityGift: false,
      pointsLedger: false,
    },
    // 新增的数据表选项
    shiftData: {
      shiftHandovers: false,  // 交班记录
      shiftReceivers: false,  // 接班人列表
    },
    merchantSettlement: {
      balanceChangeLogs: false,  // 变动明细
      initialBalances: false,    // 初始余额（shared_data_store中的merchant_initial_balance_*）
    },
    referralRelations: false,  // 推荐关系
    auditRecords: false,       // 审核记录
    operationLogs: false,      // 操作日志
    loginLogs: false,          // 登录日志
    knowledgeData: {           // 知识库数据
      categories: false,
      articles: false,
    },
    preserveActivityData: true, // 保留消费奖励/推荐奖励/剩余积分
  });

  useEffect(() => {
    const initData = async () => {
      setProductionLocked(isProductionLocked());
      const nav = await loadNavConfig();
      setNavConfig(nav);
    };
    initData();
  }, []);

  const handleNavChange = (navKey: string, field: keyof NavigationConfig, value: any) => {
    setNavConfig(prev => prev.map(n =>
      n.navKey === navKey ? { ...n, [field]: value } : n
    ));
    setHasChanges(true);
  };

  const handleSaveAll = async () => {
    await saveNavConfig(navConfig);
    setHasChanges(false);
    toast.success(t("数据管理设置已保存", "Data management settings saved"));
  };

  // 批量删除辅助函数 - 按主键id分批删除
  const batchDeleteByIds = async (
    tableName: 'members' | 'orders' | 'points_ledger' | 'activity_gifts', 
    ids: string[], 
    batchSize = 1000
  ): Promise<{ success: number; errors: string[] }> => {
    let success = 0;
    const errors: string[] = [];
    
    for (let i = 0; i < ids.length; i += batchSize) {
      const batch = ids.slice(i, i + batchSize);
      const { error } = await supabase
        .from(tableName)
        .delete()
        .in('id', batch);
      
      if (error) {
        errors.push(`${tableName} batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      } else {
        success += batch.length;
      }
    }
    
    return { success, errors };
  };

  // 批量删除 member_activity - 按 member_id 分批删除（因为 member_activity 的关联键是 member_id）
  const batchDeleteMemberActivityByMemberIds = async (
    memberIds: string[],
    batchSize = 1000
  ): Promise<{ success: number; errors: string[] }> => {
    let success = 0;
    const errors: string[] = [];
    
    for (let i = 0; i < memberIds.length; i += batchSize) {
      const batch = memberIds.slice(i, i + batchSize);
      const { error, count } = await supabase
        .from('member_activity')
        .delete()
        .in('member_id', batch);
      
      if (error) {
        errors.push(`member_activity batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      } else {
        success += count || batch.length;
      }
    }
    
    return { success, errors };
  };

  // 批量更新外键为null - 分批处理
  const batchUnlinkByMemberIds = async (
    tableName: 'orders' | 'activity_gifts' | 'points_ledger',
    memberIds: string[],
    batchSize = 1000
  ): Promise<string[]> => {
    const errors: string[] = [];
    
    for (let i = 0; i < memberIds.length; i += batchSize) {
      const batch = memberIds.slice(i, i + batchSize);
      const { error } = await supabase
        .from(tableName)
        .update({ member_id: null })
        .in('member_id', batch);
      
      if (error) {
        errors.push(`${tableName} unlink batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
      }
    }
    
    return errors;
  };

  // 删除数据函数 - 从数据库删除（按外键依赖顺序，优化批量处理）
  const handleDeleteData = async () => {
    if (!deletePassword) {
      toast.error(t("请输入管理员密码", "Please enter admin password"));
      return;
    }
    
    // 验证管理员密码 - 通过数据库验证
    if (employee?.role !== 'admin') {
      toast.error(t("需要管理员权限", "Admin permission required"));
      return;
    }
    
    // 调用数据库函数验证密码
    const { data: verifyResult } = await supabase.rpc('verify_employee_login', {
      p_username: employee.username,
      p_password: deletePassword
    });
    
    if (!verifyResult || verifyResult.length === 0) {
      toast.error(t("管理员密码错误", "Invalid admin password"));
      return;
    }
    
    setIsDeleting(true);
    setDeleteProgress({ current: 0, total: 0, currentStep: t('准备中...', 'Preparing...') });
    const errors: string[] = [];
    const deletedSummary: { table: string; count: number }[] = [];
    
    // 计算总步骤数
    const totalSteps = [
      deleteSelections.orders,
      deleteSelections.members.pointsLedger,
      deleteSelections.members.activityGift,
      deleteSelections.members.activityData,
      deleteSelections.members.memberManagement,
      deleteSelections.shiftData.shiftHandovers,
      deleteSelections.shiftData.shiftReceivers,
      deleteSelections.merchantSettlement.balanceChangeLogs,
      deleteSelections.merchantSettlement.initialBalances,
      deleteSelections.referralRelations,
      deleteSelections.auditRecords,
      deleteSelections.operationLogs,
      deleteSelections.loginLogs,
      deleteSelections.knowledgeData.articles,
      deleteSelections.knowledgeData.categories,
    ].filter(Boolean).length;
    let completedSteps = 0;
    const updateProgress = (step: string) => {
      completedSteps++;
      setDeleteProgress({ current: completedSteps, total: totalSteps, currentStep: step });
    };
    
    try {
      const retainMonths = parseInt(deleteRetainMonths);
      const deleteAll = retainMonths === 0;
      const cutoffDate = new Date();
      if (!deleteAll) {
        cutoffDate.setMonth(cutoffDate.getMonth() - retainMonths);
      }
      const cutoffDateStr = cutoffDate.toISOString();
      // ===== 收集待删除的 ID =====
      
      // 收集待删除的订单 ID
      let orderIdsToDelete: string[] = [];
      if (deleteSelections.orders) {
        let offset = 0;
        const fetchBatchSize = 1000;
        while (true) {
          const query = deleteAll
            ? supabase.from('orders').select('id').neq('id', '00000000-0000-0000-0000-000000000000').range(offset, offset + fetchBatchSize - 1)
            : supabase.from('orders').select('id').lt('created_at', cutoffDateStr).range(offset, offset + fetchBatchSize - 1);
          const { data: batch } = await query;
          if (!batch || batch.length === 0) break;
          orderIdsToDelete = orderIdsToDelete.concat(batch.map(o => o.id));
          if (batch.length < fetchBatchSize) break;
          offset += fetchBatchSize;
        }
      }
      
      // 收集待删除的会员 ID 和 member_code
      let memberIdsToDelete: string[] = [];
      let memberCodesToDelete: string[] = [];
      if (deleteSelections.members.memberManagement) {
        let offset = 0;
        const fetchBatchSize = 1000;
        while (true) {
          const query = deleteAll
            ? supabase.from('members').select('id, member_code').neq('id', '00000000-0000-0000-0000-000000000000').range(offset, offset + fetchBatchSize - 1)
            : supabase.from('members').select('id, member_code').lt('created_at', cutoffDateStr).range(offset, offset + fetchBatchSize - 1);
          const { data: batch } = await query;
          if (!batch || batch.length === 0) break;
          memberIdsToDelete = memberIdsToDelete.concat(batch.map(m => m.id));
          memberCodesToDelete = memberCodesToDelete.concat(batch.map(m => m.member_code).filter(Boolean));
          if (batch.length < fetchBatchSize) break;
          offset += fetchBatchSize;
        }
      }
      
      // ===== 按外键依赖顺序删除（从依赖表到被依赖表）=====
      
      // 步骤 1: 处理 points_ledger（依赖 orders 和 members）
      // 1a. 如果要删除订单，先处理 points_ledger 中的 order_id 外键
      if (orderIdsToDelete.length > 0) {
        for (let i = 0; i < orderIdsToDelete.length; i += 500) {
          const batch = orderIdsToDelete.slice(i, i + 500);
          if (deleteSelections.members.pointsLedger) {
            // 如果也要删除积分明细，直接删除这些记录
            const { error } = await supabase.from('points_ledger').delete().in('order_id', batch);
            if (error) errors.push(`积分明细(订单关联) batch ${Math.floor(i / 500) + 1}: ${error.message}`);
          } else {
            // 否则只解绑 order_id
            const { error } = await supabase.from('points_ledger').update({ order_id: null }).in('order_id', batch);
            if (error) errors.push(`解绑积分明细订单 batch ${Math.floor(i / 500) + 1}: ${error.message}`);
          }
        }
      }
      
      // 1b. 如果要删除会员，先处理 points_ledger 中的 member_id 外键
      if (memberIdsToDelete.length > 0) {
        for (let i = 0; i < memberIdsToDelete.length; i += 500) {
          const batch = memberIdsToDelete.slice(i, i + 500);
          if (deleteSelections.members.pointsLedger) {
            // 如果也要删除积分明细，直接删除这些记录
            const { error } = await supabase.from('points_ledger').delete().in('member_id', batch);
            if (error) errors.push(`积分明细(会员关联) batch ${Math.floor(i / 500) + 1}: ${error.message}`);
          } else {
            // 否则只解绑 member_id
            const { error } = await supabase.from('points_ledger').update({ member_id: null }).in('member_id', batch);
            if (error) errors.push(`解绑积分明细会员 batch ${Math.floor(i / 500) + 1}: ${error.message}`);
          }
        }
      }
      
      // 1c. 如果只选择删除积分明细（且上面没有处理），按时间删除剩余的
      if (deleteSelections.members.pointsLedger && orderIdsToDelete.length === 0 && memberIdsToDelete.length === 0) {
        const { count } = deleteAll 
          ? await supabase.from('points_ledger').select('*', { count: 'exact', head: true }).neq('id', '00000000-0000-0000-0000-000000000000')
          : await supabase.from('points_ledger').select('*', { count: 'exact', head: true }).lt('created_at', cutoffDateStr);
        
        const { error } = deleteAll 
          ? await supabase.from('points_ledger').delete().neq('id', '00000000-0000-0000-0000-000000000000')
          : await supabase.from('points_ledger').delete().lt('created_at', cutoffDateStr);
        
        if (error) errors.push(`积分明细: ${error.message}`);
        else if (count) deletedSummary.push({ table: '积分明细', count });
        updateProgress(t('积分明细', 'Points Ledger'));
      }
      
      // 步骤 2: 删除 activity_gifts（依赖 members）
      if (deleteSelections.members.activityGift) {
        const { count } = deleteAll 
          ? await supabase.from('activity_gifts').select('*', { count: 'exact', head: true }).neq('id', '00000000-0000-0000-0000-000000000000')
          : await supabase.from('activity_gifts').select('*', { count: 'exact', head: true }).lt('created_at', cutoffDateStr);
        
        const { error } = deleteAll 
          ? await supabase.from('activity_gifts').delete().neq('id', '00000000-0000-0000-0000-000000000000')
          : await supabase.from('activity_gifts').delete().lt('created_at', cutoffDateStr);
        
        if (error) errors.push(`活动赠送: ${error.message}`);
        else if (count) deletedSummary.push({ table: '活动赠送', count });
        updateProgress(t('活动赠送', 'Activity Gifts'));
      } else if (memberIdsToDelete.length > 0) {
        // 如果要删除会员但没选择删除活动赠送，也需要先删除/解绑关联的 activity_gifts
        for (let i = 0; i < memberIdsToDelete.length; i += 500) {
          const batch = memberIdsToDelete.slice(i, i + 500);
          // 解绑 member_id（设为 NULL）而不是删除
          const { error } = await supabase.from('activity_gifts').update({ member_id: null }).in('member_id', batch);
          if (error) errors.push(`解绑活动赠送 batch ${Math.floor(i / 500) + 1}: ${error.message}`);
        }
      }
      
      // 步骤 3: 删除 member_activity（依赖 members）
      // ⚠️ 重要修复：如果勾选了 preserveActivityData，则不删除 member_activity 中的积分相关数据
      if (memberIdsToDelete.length > 0) {
        // 只有当 preserveActivityData = false 时才删除 member_activity
        if (!deleteSelections.preserveActivityData) {
          let deletedCount = 0;
          for (let i = 0; i < memberIdsToDelete.length; i += 500) {
            const batch = memberIdsToDelete.slice(i, i + 500);
            const { error } = await supabase.from('member_activity').delete().in('member_id', batch);
            const batchCount = batch.length;
            if (error) errors.push(`会员活动 batch ${Math.floor(i / 500) + 1}: ${error.message}`);
            else deletedCount += batchCount;
          }
          if (deletedCount > 0) {
            deletedSummary.push({ table: '会员活动(关联)', count: deletedCount });
          }
          updateProgress(t('会员活动数据', 'Member Activity'));
        } else {
          // 如果保留积分数据，仅解绑 member_id（设为 NULL），保留积分统计
          console.log('[DataManagement] Preserving activity data - unlinking member_id instead of deleting');
          for (let i = 0; i < memberIdsToDelete.length; i += 500) {
            const batch = memberIdsToDelete.slice(i, i + 500);
            const { error } = await supabase.from('member_activity').update({ member_id: null }).in('member_id', batch);
            if (error) errors.push(`解绑会员活动 batch ${Math.floor(i / 500) + 1}: ${error.message}`);
          }
        }
      } else if (deleteSelections.members.activityData && !deleteSelections.preserveActivityData) {
        // 仅删除活动数据，不删除会员
        if (deleteAll) {
          const { count: c1 } = await supabase.from('member_activity').select('*', { count: 'exact', head: true }).neq('id', '00000000-0000-0000-0000-000000000000');
          const { error: e1 } = await supabase.from('member_activity').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (e1) errors.push(`会员活动: ${e1.message}`);
          else if (c1) deletedSummary.push({ table: '会员活动', count: c1 });
        }
      }
      
      // 步骤 4: 删除 points_accounts（通过 member_code 关联）
      // ⚠️ 同样尊重 preserveActivityData 设置
      if (memberCodesToDelete.length > 0 && !deleteSelections.preserveActivityData) {
        for (let i = 0; i < memberCodesToDelete.length; i += 500) {
          const batch = memberCodesToDelete.slice(i, i + 500);
          const { error } = await supabase.from('points_accounts').delete().in('member_code', batch);
          if (error) errors.push(`积分账户 batch ${Math.floor(i / 500) + 1}: ${error.message}`);
        }
      } else if (deleteSelections.members.activityData && !deleteSelections.preserveActivityData && deleteAll) {
        const { count: c2 } = await supabase.from('points_accounts').select('*', { count: 'exact', head: true }).neq('id', '00000000-0000-0000-0000-000000000000');
        const { error: e2 } = await supabase.from('points_accounts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (e2) errors.push(`积分账户: ${e2.message}`);
        else if (c2) deletedSummary.push({ table: '积分账户', count: c2 });
      }
      
      // 步骤 5: 解绑 orders.member_id（如果要删除会员但不删除订单）
      if (memberIdsToDelete.length > 0 && !deleteSelections.orders) {
        for (let i = 0; i < memberIdsToDelete.length; i += 500) {
          const batch = memberIdsToDelete.slice(i, i + 500);
          const { error } = await supabase.from('orders').update({ member_id: null }).in('member_id', batch);
          if (error) errors.push(`解绑订单会员 batch ${Math.floor(i / 500) + 1}: ${error.message}`);
        }
      }
      
      // 步骤 6: 删除订单（points_ledger 已处理）
      if (orderIdsToDelete.length > 0) {
        let deletedCount = 0;
        
        // 🔧 新增：如果选择回收活动数据，逐条调用 reversePointsOnOrderCancel
        if (deleteSelections.recycleActivityDataOnOrderDelete) {
          console.log('[DataManagement] Recycling activity data for', orderIdsToDelete.length, 'orders');
          let recycledCount = 0;
          
          for (let i = 0; i < orderIdsToDelete.length; i++) {
            const orderId = orderIdsToDelete[i];
            try {
              await reversePointsOnOrderCancel(orderId);
              recycledCount++;
              
              // 每处理100条输出进度
              if ((i + 1) % 100 === 0) {
                console.log(`[DataManagement] Recycled ${i + 1}/${orderIdsToDelete.length} orders`);
              }
            } catch (error) {
              console.error(`[DataManagement] Failed to recycle order ${orderId}:`, error);
            }
          }
          
          console.log(`[DataManagement] Recycled activity data for ${recycledCount} orders`);
        }
        
        // 删除订单记录
        for (let i = 0; i < orderIdsToDelete.length; i += 500) {
          const batch = orderIdsToDelete.slice(i, i + 500);
          const { error } = await supabase.from('orders').delete().in('id', batch);
          if (error) errors.push(`订单 batch ${Math.floor(i / 500) + 1}: ${error.message}`);
          else deletedCount += batch.length;
        }
        if (deletedCount > 0) {
          const label = deleteSelections.recycleActivityDataOnOrderDelete 
            ? '订单(含活动数据回收)' 
            : '订单';
          deletedSummary.push({ table: label, count: deletedCount });
        }
        updateProgress(t('订单数据', 'Orders'));
      }
      
      // 步骤 7: 删除推荐关系
      if (deleteSelections.referralRelations) {
        const { count } = deleteAll 
          ? await supabase.from('referral_relations').select('*', { count: 'exact', head: true }).neq('id', '00000000-0000-0000-0000-000000000000')
          : await supabase.from('referral_relations').select('*', { count: 'exact', head: true }).lt('created_at', cutoffDateStr);
        
        const { error } = deleteAll 
          ? await supabase.from('referral_relations').delete().neq('id', '00000000-0000-0000-0000-000000000000')
          : await supabase.from('referral_relations').delete().lt('created_at', cutoffDateStr);
        
        if (error) errors.push(`推荐关系: ${error.message}`);
        else if (count) deletedSummary.push({ table: '推荐关系', count });
        updateProgress(t('推荐关系', 'Referral Relations'));
      }
      
      // 步骤 7b: 删除商家结算数据
      if (deleteSelections.merchantSettlement.balanceChangeLogs) {
        // 先删除 ledger_transactions（账本明细）
        const { count: ledgerCount } = deleteAll 
          ? await supabase.from('ledger_transactions').select('*', { count: 'exact', head: true }).neq('id', '00000000-0000-0000-0000-000000000000')
          : await supabase.from('ledger_transactions').select('*', { count: 'exact', head: true }).lt('created_at', cutoffDateStr);
        
        const { error: ledgerError } = deleteAll 
          ? await supabase.from('ledger_transactions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
          : await supabase.from('ledger_transactions').delete().lt('created_at', cutoffDateStr);
        
        if (ledgerError) errors.push(`账本明细(ledger_transactions): ${ledgerError.message}`);
        else if (ledgerCount) deletedSummary.push({ table: '账本明细(ledger_transactions)', count: ledgerCount });

        // 再删除 balance_change_logs（旧版变动明细）
        const { count } = deleteAll 
          ? await supabase.from('balance_change_logs').select('*', { count: 'exact', head: true }).neq('id', '00000000-0000-0000-0000-000000000000')
          : await supabase.from('balance_change_logs').select('*', { count: 'exact', head: true }).lt('created_at', cutoffDateStr);
        
        const { error } = deleteAll 
          ? await supabase.from('balance_change_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
          : await supabase.from('balance_change_logs').delete().lt('created_at', cutoffDateStr);
        
        if (error) errors.push(`变动明细: ${error.message}`);
        else if (count) deletedSummary.push({ table: '变动明细(balance_change_logs)', count });
        updateProgress(t('变动明细', 'Balance Change Logs'));
      }
      
      if (deleteSelections.merchantSettlement.initialBalances) {
        // 删除 shared_data_store 中的初始余额数据和结算数据
        const { data: balanceKeys } = await supabase
          .from('shared_data_store')
          .select('id, data_key')
          .or('data_key.like.merchant_initial_balance_%,data_key.like.settlement_last_reset_%');
        
        if (balanceKeys && balanceKeys.length > 0) {
          const ids = balanceKeys.map(k => k.id);
          for (let i = 0; i < ids.length; i += 500) {
            const batch = ids.slice(i, i + 500);
            const { error } = await supabase.from('shared_data_store').delete().in('id', batch);
            if (error) errors.push(`初始余额: ${error.message}`);
          }
          deletedSummary.push({ table: '初始余额/重置时间', count: balanceKeys.length });
        }
        
        // 重置 cardMerchantSettlements 和 paymentProviderSettlements 中的提款/充值明细和初始余额
        try {
          const { loadSharedData, saveSharedData } = await import('@/services/sharedDataService');
          
          // 重置卡商结算：清空提款明细，初始余额归0
          const cardSettlements = await loadSharedData<any[]>('cardMerchantSettlements');
          if (cardSettlements && cardSettlements.length > 0) {
            const resetCard = cardSettlements.map((s: any) => ({
              ...s,
              initialBalance: 0,
              lastResetTime: null,
              withdrawals: [],
              history: [],
            }));
            await saveSharedData('cardMerchantSettlements', resetCard);
            deletedSummary.push({ table: '卡商提款明细+初始余额', count: cardSettlements.length });
          }
          
          // 重置代付商家结算：清空充值明细，初始余额归0
          const providerSettlements = await loadSharedData<any[]>('paymentProviderSettlements');
          if (providerSettlements && providerSettlements.length > 0) {
            const resetProvider = providerSettlements.map((s: any) => ({
              ...s,
              initialBalance: 0,
              lastResetTime: null,
              recharges: [],
              history: [],
            }));
            await saveSharedData('paymentProviderSettlements', resetProvider);
            deletedSummary.push({ table: '代付充值明细+初始余额', count: providerSettlements.length });
          }
          
          // 强制刷新结算缓存
          const { forceRefreshSettlementCache } = await import('@/stores/merchantSettlementStore');
          await forceRefreshSettlementCache();
        } catch (e) {
          console.error('Failed to reset settlement data:', e);
          errors.push(`结算数据重置: ${(e as Error).message}`);
        }
        updateProgress(t('初始余额', 'Initial Balances'));
      }

      // 步骤 8: 删除会员（所有依赖已处理）
      if (memberIdsToDelete.length > 0) {
        let deletedCount = 0;
        for (let i = 0; i < memberIdsToDelete.length; i += 500) {
          const batch = memberIdsToDelete.slice(i, i + 500);
          const { error } = await supabase.from('members').delete().in('id', batch);
          if (error) errors.push(`会员 batch ${Math.floor(i / 500) + 1}: ${error.message}`);
          else deletedCount += batch.length;
        }
        if (deletedCount > 0) deletedSummary.push({ table: '会员', count: deletedCount });
        updateProgress(t('会员数据', 'Members'));
      }
      
      // ===== 独立阶段并行删除（无外键依赖）=====
      const parallelTasks: Promise<void>[] = [];

      // 交班记录
      if (deleteSelections.shiftData.shiftHandovers) {
        parallelTasks.push((async () => {
          const { count } = deleteAll 
            ? await supabase.from('shift_handovers').select('*', { count: 'exact', head: true }).neq('id', '00000000-0000-0000-0000-000000000000')
            : await supabase.from('shift_handovers').select('*', { count: 'exact', head: true }).lt('created_at', cutoffDateStr);
          const { error } = deleteAll 
            ? await supabase.from('shift_handovers').delete().neq('id', '00000000-0000-0000-0000-000000000000')
            : await supabase.from('shift_handovers').delete().lt('created_at', cutoffDateStr);
          if (error) errors.push(`交班记录: ${error.message}`);
          else if (count) deletedSummary.push({ table: '交班记录', count });
          updateProgress(t('交班记录', 'Shift Handovers'));
        })());
      }

      if (deleteSelections.shiftData.shiftReceivers) {
        parallelTasks.push((async () => {
          const { count } = await supabase.from('shift_receivers').select('*', { count: 'exact', head: true }).neq('id', '00000000-0000-0000-0000-000000000000');
          const { error } = await supabase.from('shift_receivers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
          if (error) errors.push(`接班人列表: ${error.message}`);
          else if (count) deletedSummary.push({ table: '接班人列表', count });
          updateProgress(t('接班人列表', 'Shift Receivers'));
        })());
      }

      // 审核记录
      if (deleteSelections.auditRecords) {
        parallelTasks.push((async () => {
          const { count } = deleteAll 
            ? await supabase.from('audit_records').select('*', { count: 'exact', head: true }).neq('id', '00000000-0000-0000-0000-000000000000')
            : await supabase.from('audit_records').select('*', { count: 'exact', head: true }).lt('created_at', cutoffDateStr);
          const { error } = deleteAll 
            ? await supabase.from('audit_records').delete().neq('id', '00000000-0000-0000-0000-000000000000')
            : await supabase.from('audit_records').delete().lt('created_at', cutoffDateStr);
          if (error) errors.push(`审核记录: ${error.message}`);
          else if (count) deletedSummary.push({ table: '审核记录', count });
          updateProgress(t('审核记录', 'Audit Records'));
        })());
      }

      // 操作日志
      if (deleteSelections.operationLogs) {
        parallelTasks.push((async () => {
          const { count } = deleteAll 
            ? await supabase.from('operation_logs').select('*', { count: 'exact', head: true }).neq('id', '00000000-0000-0000-0000-000000000000')
            : await supabase.from('operation_logs').select('*', { count: 'exact', head: true }).lt('timestamp', cutoffDateStr);
          const { error } = deleteAll 
            ? await supabase.from('operation_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
            : await supabase.from('operation_logs').delete().lt('timestamp', cutoffDateStr);
          if (error) errors.push(`操作日志: ${error.message}`);
          else if (count) deletedSummary.push({ table: '操作日志', count });
          updateProgress(t('操作日志', 'Operation Logs'));
        })());
      }

      // 登录日志
      if (deleteSelections.loginLogs) {
        parallelTasks.push((async () => {
          const { count } = deleteAll 
            ? await supabase.from('employee_login_logs').select('*', { count: 'exact', head: true }).neq('id', '00000000-0000-0000-0000-000000000000')
            : await supabase.from('employee_login_logs').select('*', { count: 'exact', head: true }).lt('login_time', cutoffDateStr);
          const { error } = deleteAll 
            ? await supabase.from('employee_login_logs').delete().neq('id', '00000000-0000-0000-0000-000000000000')
            : await supabase.from('employee_login_logs').delete().lt('login_time', cutoffDateStr);
          if (error) errors.push(`登录日志: ${error.message}`);
          else if (count) deletedSummary.push({ table: '登录日志', count });
          updateProgress(t('登录日志', 'Login Logs'));
        })());
      }

      // 知识库文章
      if (deleteSelections.knowledgeData.articles) {
        parallelTasks.push((async () => {
          const { count } = deleteAll 
            ? await supabase.from('knowledge_articles').select('*', { count: 'exact', head: true }).neq('id', '00000000-0000-0000-0000-000000000000')
            : await supabase.from('knowledge_articles').select('*', { count: 'exact', head: true }).lt('created_at', cutoffDateStr);
          const { error } = deleteAll 
            ? await supabase.from('knowledge_articles').delete().neq('id', '00000000-0000-0000-0000-000000000000')
            : await supabase.from('knowledge_articles').delete().lt('created_at', cutoffDateStr);
          if (error) errors.push(`知识库文章: ${error.message}`);
          else if (count) deletedSummary.push({ table: '知识库文章', count });
          updateProgress(t('知识库文章', 'Knowledge Articles'));
        })());
      }

      // Wait for all independent deletions to complete
      await Promise.all(parallelTasks);

      // 知识库分类 must run after articles (FK dependency)
      if (deleteSelections.knowledgeData.categories) {
        const { count } = await supabase.from('knowledge_categories').select('*', { count: 'exact', head: true }).neq('id', '00000000-0000-0000-0000-000000000000');
        const { error } = await supabase.from('knowledge_categories').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (error) errors.push(`知识库分类: ${error.message}`);
        else if (count) deletedSummary.push({ table: '知识库分类', count });
        updateProgress(t('知识库分类', 'Knowledge Categories'));
      }
      
      // ===== 记录批量删除操作日志 =====
      if (deletedSummary.length > 0) {
        const summaryText = deletedSummary.map(s => `${s.table}: ${s.count}条`).join(', ');
        const totalCount = deletedSummary.reduce((acc, s) => acc + s.count, 0);
        
        logOperation(
          'system_settings',
          'delete',
          'batch_data_cleanup',
          {
            retainMonths: deleteAll ? 0 : retainMonths,
            cutoffDate: deleteAll ? '全部' : cutoffDateStr,
              selections: {
                orders: deleteSelections.orders,
                recycleActivityDataOnOrderDelete: deleteSelections.recycleActivityDataOnOrderDelete,
                members: deleteSelections.members,
                shiftData: deleteSelections.shiftData,
                merchantSettlement: deleteSelections.merchantSettlement,
                referralRelations: deleteSelections.referralRelations,
                auditRecords: deleteSelections.auditRecords,
                operationLogs: deleteSelections.operationLogs,
                loginLogs: deleteSelections.loginLogs,
                knowledgeData: deleteSelections.knowledgeData,
              }
          },
          {
            deletedSummary,
            totalCount,
          },
          `批量数据删除: 共删除 ${totalCount} 条记录 (${summaryText})`
        );
      }
      
      // 显示结果
      if (errors.length > 0) {
        console.error('Delete data errors:', errors);
        toast.error(t(`部分删除失败: ${errors.slice(0, 3).join('; ')}${errors.length > 3 ? '...' : ''}`, `Some deletions failed`));
      } else {
        const totalCount = deletedSummary.reduce((acc, s) => acc + s.count, 0);
        toast.success(t(
          `数据删除成功，共删除 ${totalCount} 条记录`, 
          `Data deleted successfully, ${totalCount} records removed`
        ));
        if (orderIdsToDelete.length > 0 || (memberIdsToDelete.length > 0 && !deleteSelections.orders)) {
          queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
          queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
          queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
          queryClient.invalidateQueries({ queryKey: ['orders'] });
          queryClient.invalidateQueries({ queryKey: ['usdt-orders'] });
          window.dispatchEvent(new CustomEvent('report-cache-invalidate'));
          window.dispatchEvent(new CustomEvent('leaderboard-refresh'));
        }
        setIsDeleteDialogOpen(false);
        setDeletePassword("");
      }
    } catch (error) {
      console.error('Delete data error:', error);
      toast.error(t("删除数据失败", "Failed to delete data"));
    } finally {
      setIsDeleting(false);
      setDeleteProgress({ current: 0, total: 0, currentStep: '' });
    }
  };

  // 生产模式：不再提供自动数据清理功能
  // 所有数据操作只能通过明确的人工操作或业务流程进行

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      {useCompactLayout ? (
        <div>
          <Select value={activeTab} onValueChange={setActiveTab}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="exportImport">{t("导入导出", "Import/Export")}</SelectItem>
              
              <SelectItem value="navigation">{t("导航配置", "Navigation")}</SelectItem>
              <SelectItem value="deleteData">{t("数据删除", "Delete Data")}</SelectItem>
              <SelectItem value="memoSettings">{t("备忘录设置", "Memo Settings")}</SelectItem>
              <SelectItem value="production">{t("生产锁定", "Production Lock")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      ) : (
        <TabsList>
          <TabsTrigger value="exportImport" className="gap-2">
            <Download className="h-4 w-4" />
            {t("导入导出", "Import/Export")}
          </TabsTrigger>
          <TabsTrigger value="navigation" className="gap-2">
            <Navigation className="h-4 w-4" />
            {t("导航配置", "Navigation")}
          </TabsTrigger>
          <TabsTrigger value="deleteData" className="gap-2">
            <Trash2 className="h-4 w-4" />
            {t("数据删除", "Delete Data")}
          </TabsTrigger>
          <TabsTrigger value="memoSettings" className="gap-2">
            <Bell className="h-4 w-4" />
            {t("备忘录设置", "Memo Settings")}
          </TabsTrigger>
          <TabsTrigger value="production" className="gap-2">
            <Lock className="h-4 w-4" />
            {t("生产锁定", "Production Lock")}
          </TabsTrigger>
        </TabsList>
      )}

      {/* 生产锁定状态提示 */}
      {productionLocked && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 flex items-center gap-3">
          <Lock className="h-5 w-5 text-green-600" />
          <div>
            <p className="font-medium text-green-700">{t("生产锁定状态", "Production Lock Active")}</p>
            <p className="text-sm text-green-600">{t("系统已禁止自动生成演示数据，仅允许业务流程产生的新数据写入", "Auto-generation of demo data is disabled. Only business-generated data is allowed.")}</p>
          </div>
        </div>
      )}

      {/* 导入导出 */}
      <TabsContent value="exportImport">
        <DataExportImportTab />
      </TabsContent>


      {/* 导航文字配置 */}
      <TabsContent value="navigation">
        <div className="space-y-4">
          {hasChanges && (
            <div className="flex justify-end">
              <Button onClick={handleSaveAll} className="gap-2">
                <Save className="h-4 w-4" />
                {t("保存设置", "Save Settings")}
              </Button>
            </div>
          )}
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Navigation className="h-5 w-5" />
                {t("导航文字配置", "Navigation Text Configuration")}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {t(
                  "自定义左侧导航栏的显示文字",
                  "Customize the display text of the left navigation bar"
                )}
              </p>
            </CardHeader>
            <CardContent>
              {useCompactLayout ? (
                <div className="space-y-2">
                  {navConfig.map((nav) => (
                    <div key={nav.navKey} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline">{nav.navKey}</Badge>
                        {editingNav === nav.navKey ? (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" onClick={() => setEditingNav(null)}>
                            <Check className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingNav(nav.navKey)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <div>
                          <Label className="text-xs text-muted-foreground">{t("中文显示", "Chinese Display")}</Label>
                          {editingNav === nav.navKey ? (
                            <Input value={nav.displayTextZh} onChange={(e) => handleNavChange(nav.navKey, "displayTextZh", e.target.value)} className="h-8 mt-0.5" />
                          ) : (
                            <p className="text-sm">{nav.displayTextZh}</p>
                          )}
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">{t("英文显示", "English Display")}</Label>
                          {editingNav === nav.navKey ? (
                            <Input value={nav.displayTextEn} onChange={(e) => handleNavChange(nav.navKey, "displayTextEn", e.target.value)} className="h-8 mt-0.5" />
                          ) : (
                            <p className="text-sm">{nav.displayTextEn}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-[120px]">{t("导航项", "Nav Item")}</TableHead>
                        <TableHead>{t("中文显示", "Chinese Display")}</TableHead>
                        <TableHead>{t("英文显示", "English Display")}</TableHead>
                        <TableHead className="w-[80px] text-center">{t("操作", "Actions")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {navConfig.map((nav) => (
                        <TableRow key={nav.navKey}>
                          <TableCell>
                            <Badge variant="outline">{nav.navKey}</Badge>
                          </TableCell>
                          <TableCell>
                            {editingNav === nav.navKey ? (
                              <Input value={nav.displayTextZh} onChange={(e) => handleNavChange(nav.navKey, "displayTextZh", e.target.value)} className="h-8" />
                            ) : (
                              <span>{nav.displayTextZh}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {editingNav === nav.navKey ? (
                              <Input value={nav.displayTextEn} onChange={(e) => handleNavChange(nav.navKey, "displayTextEn", e.target.value)} className="h-8" />
                            ) : (
                              <span>{nav.displayTextEn}</span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {editingNav === nav.navKey ? (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" onClick={() => setEditingNav(null)}>
                                <Check className="h-4 w-4" />
                              </Button>
                            ) : (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditingNav(nav.navKey)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* 权限设置Tab已移除，权限设置在系统设置里单独的权限设置Tab中 */}

      {/* 数据删除 */}
      <TabsContent value="deleteData">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                {t("数据删除", "Delete Data")}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {t(
                  "选择要删除的数据类型，支持按时间保留或全部删除",
                  "Select data types to delete, with options to retain by time or delete all"
                )}
              </p>
            </CardHeader>
            <CardContent>
              <Button 
                variant="destructive" 
                className="gap-2"
                onClick={() => setIsDeleteDialogOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
                {t("打开删除数据对话框", "Open Delete Data Dialog")}
              </Button>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* 备忘录设置 */}
      <TabsContent value="memoSettings">
        <MemoSettingsTab />
      </TabsContent>

      {/* 生产锁定 - 系统已进入正式运行阶段，禁止批量删除功能 */}
      <TabsContent value="production">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2">
                <Lock className="h-5 w-5" />
                {t("生产模式", "Production Mode")}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {t(
                  "系统已进入正式运行阶段",
                  "System is now in production mode"
                )}
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 状态显示 */}
              <div className="text-center p-6 bg-green-500/10 rounded-lg">
                <Lock className="h-10 w-10 text-green-600 mx-auto mb-3" />
                <p className="font-medium text-lg text-green-700">
                  {t("生产模式已激活", "Production Mode Activated")}
                </p>
                <p className="text-sm text-green-600 mt-2">
                  {t("系统已进入正式运行状态，所有数据操作只能通过明确的人工操作或业务流程进行", "System is now in production mode. All data operations can only be performed through explicit manual operations or business processes.")}
                </p>
              </div>

              {/* 系统行为说明 */}
              <div className="text-sm space-y-2 p-4 bg-muted/30 rounded-lg">
                <p className="font-medium">{t("系统当前行为", "Current system behavior")}:</p>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                  <li>{t("❌ 禁止任何自动删除数据", "No automatic data deletion")}</li>
                  <li>{t("❌ 禁止数据保留清理", "No data retention cleanup")}</li>
                  <li>{t("❌ 禁止初始化清空", "No initialization clearing")}</li>
                  <li>{t("❌ 禁止历史重算逻辑", "No historical recalculation")}</li>
                  <li>{t("✅ 仅允许人工操作或业务流程产生的新数据写入", "Only manually or business-generated new data allowed")}</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      {/* 说明 */}
      {activeTab !== "permissions" && activeTab !== "production" && (
        <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-lg">
          💡 {t(
            "数据管理设置仅作为规则配置。数据保留策略需配合后端定时任务执行。报表标题和导航文字修改后需刷新页面生效。",
            "Data management settings are for configuration only. Retention policies require backend scheduled tasks. Report titles and navigation text changes take effect after page refresh."
          )}
        </div>
      )}

      {/* 删除数据对话框 */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              {t("删除数据", "Delete Data")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "请选择要删除的数据类型和保留时间。此操作不可撤销。",
                "Select data types to delete and retention period. This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4 py-4">
            {/* 保留时间设置 */}
            <div className="space-y-2">
              <Label>{t("保留近期数据", "Retain Recent Data")}</Label>
              <Select value={deleteRetainMonths} onValueChange={setDeleteRetainMonths}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">{t("全部删除，不保留", "Delete all, no retention")}</SelectItem>
                  <SelectItem value="1">{t("保留近1个月", "Keep last 1 month")}</SelectItem>
                  <SelectItem value="3">{t("保留近3个月", "Keep last 3 months")}</SelectItem>
                  <SelectItem value="6">{t("保留近6个月", "Keep last 6 months")}</SelectItem>
                  <SelectItem value="12">{t("保留近12个月", "Keep last 12 months")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* 全选/取消全选按钮 */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteSelections({
                  orders: true,
                  recycleActivityDataOnOrderDelete: false,
                  reports: { employee: true, card: true, vendor: true, daily: true },
                  members: { memberManagement: true, activityData: true, activityGift: true, pointsLedger: true },
                  shiftData: { shiftHandovers: true, shiftReceivers: true },
                  merchantSettlement: { balanceChangeLogs: true, initialBalances: true },
                  referralRelations: true,
                  auditRecords: true,
                  operationLogs: true,
                  loginLogs: true,
                  knowledgeData: { categories: true, articles: true },
                  preserveActivityData: true,
                })}
              >
                {t("全选", "Select All")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeleteSelections({
                  orders: false,
                  recycleActivityDataOnOrderDelete: false,
                  reports: { employee: false, card: false, vendor: false, daily: false },
                  members: { memberManagement: false, activityData: false, activityGift: false, pointsLedger: false },
                  shiftData: { shiftHandovers: false, shiftReceivers: false },
                  merchantSettlement: { balanceChangeLogs: false, initialBalances: false },
                  referralRelations: false,
                  auditRecords: false,
                  operationLogs: false,
                  loginLogs: false,
                  knowledgeData: { categories: false, articles: false },
                  preserveActivityData: true,
                })}
              >
                {t("取消全选", "Deselect All")}
              </Button>
            </div>
            
            {/* 订单管理 */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="delete-orders"
                  checked={deleteSelections.orders}
                  onCheckedChange={(checked) => setDeleteSelections(prev => ({
                    ...prev,
                    orders: checked === true,
                    // 取消订单时自动取消回收选项
                    recycleActivityDataOnOrderDelete: checked === true ? prev.recycleActivityDataOnOrderDelete : false
                  }))}
                />
                <Label htmlFor="delete-orders" className="font-medium">{t("订单管理", "Order Management")}</Label>
              </div>
              <p className="text-xs text-muted-foreground ml-6">{t("赛地/奈拉模式和USDT模式订单", "GHS/NGN and USDT orders")}</p>
              
              {/* 回收会员活动数据选项 - 仅在选择删除订单时显示 */}
              {deleteSelections.orders && (
                <div className="ml-6 mt-2 p-3 border rounded-lg bg-muted/30 space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="recycle-activity-data"
                      checked={deleteSelections.recycleActivityDataOnOrderDelete}
                      onCheckedChange={(checked) => setDeleteSelections(prev => ({
                        ...prev,
                        recycleActivityDataOnOrderDelete: checked === true
                      }))}
                    />
                    <Label htmlFor="recycle-activity-data" className="text-sm font-medium">
                      {t("同时回收会员活动数据", "Also recycle member activity data")}
                    </Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "回收累积次数、累积利润、累积奈拉/赛地/US等数据（与订单管理删除行为一致）",
                      "Recycle order_count, accumulated_profit, accumulated amounts (same as order management deletion)"
                    )}
                  </p>
                  {deleteSelections.recycleActivityDataOnOrderDelete && (
                    <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-900/20 p-2 rounded">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {t(
                        "启用后将逐条处理订单并回收对应的会员活动数据，处理时间较长",
                        "This will process each order and recycle corresponding activity data, which takes longer"
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* 报表管理 */}
            <div className="space-y-2">
              <Label className="font-medium">{t("报表管理", "Report Management")}</Label>
              <div className="ml-4 space-y-1">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="delete-report-employee"
                    checked={deleteSelections.reports.employee}
                    onCheckedChange={(checked) => setDeleteSelections(prev => ({
                      ...prev,
                      reports: { ...prev.reports, employee: checked === true }
                    }))}
                  />
                  <Label htmlFor="delete-report-employee" className="text-sm">{t("员工利润报表", "Employee Report")}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="delete-report-card"
                    checked={deleteSelections.reports.card}
                    onCheckedChange={(checked) => setDeleteSelections(prev => ({
                      ...prev,
                      reports: { ...prev.reports, card: checked === true }
                    }))}
                  />
                  <Label htmlFor="delete-report-card" className="text-sm">{t("卡片报表", "Card Report")}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="delete-report-vendor"
                    checked={deleteSelections.reports.vendor}
                    onCheckedChange={(checked) => setDeleteSelections(prev => ({
                      ...prev,
                      reports: { ...prev.reports, vendor: checked === true }
                    }))}
                  />
                  <Label htmlFor="delete-report-vendor" className="text-sm">{t("卡商报表", "Vendor Report")}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="delete-report-daily"
                    checked={deleteSelections.reports.daily}
                    onCheckedChange={(checked) => setDeleteSelections(prev => ({
                      ...prev,
                      reports: { ...prev.reports, daily: checked === true }
                    }))}
                  />
                  <Label htmlFor="delete-report-daily" className="text-sm">{t("每日报表", "Daily Report")}</Label>
                </div>
              </div>
            </div>
            
            {/* 会员管理 */}
            <div className="space-y-2">
              <Label className="font-medium">{t("会员管理", "Member Management")}</Label>
              <div className="ml-4 space-y-1">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="delete-member-management"
                    checked={deleteSelections.members.memberManagement}
                    onCheckedChange={(checked) => setDeleteSelections(prev => ({
                      ...prev,
                      members: { ...prev.members, memberManagement: checked === true }
                    }))}
                  />
                  <Label htmlFor="delete-member-management" className="text-sm">{t("会员管理", "Member Management")}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="delete-activity-data"
                    checked={deleteSelections.members.activityData}
                    onCheckedChange={(checked) => setDeleteSelections(prev => ({
                      ...prev,
                      members: { ...prev.members, activityData: checked === true }
                    }))}
                  />
                  <Label htmlFor="delete-activity-data" className="text-sm">{t("活动数据", "Activity Data")}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="delete-activity-gift"
                    checked={deleteSelections.members.activityGift}
                    onCheckedChange={(checked) => setDeleteSelections(prev => ({
                      ...prev,
                      members: { ...prev.members, activityGift: checked === true }
                    }))}
                  />
                  <Label htmlFor="delete-activity-gift" className="text-sm">{t("活动赠送", "Activity Gift")}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="delete-points-ledger"
                    checked={deleteSelections.members.pointsLedger}
                    onCheckedChange={(checked) => setDeleteSelections(prev => ({
                      ...prev,
                      members: { ...prev.members, pointsLedger: checked === true }
                    }))}
                  />
                  <Label htmlFor="delete-points-ledger" className="text-sm">{t("积分明细", "Points Ledger")}</Label>
                </div>
              </div>
            </div>
            
            {/* 交班数据 */}
            <div className="space-y-2">
              <Label className="font-medium">{t("交班数据", "Shift Data")}</Label>
              <div className="ml-4 space-y-1">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="delete-shift-handovers"
                    checked={deleteSelections.shiftData.shiftHandovers}
                    onCheckedChange={(checked) => setDeleteSelections(prev => ({
                      ...prev,
                      shiftData: { ...prev.shiftData, shiftHandovers: checked === true }
                    }))}
                  />
                  <Label htmlFor="delete-shift-handovers" className="text-sm">{t("交班记录", "Shift Handovers")}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="delete-shift-receivers"
                    checked={deleteSelections.shiftData.shiftReceivers}
                    onCheckedChange={(checked) => setDeleteSelections(prev => ({
                      ...prev,
                      shiftData: { ...prev.shiftData, shiftReceivers: checked === true }
                    }))}
                  />
                  <Label htmlFor="delete-shift-receivers" className="text-sm">{t("接班人列表", "Shift Receivers")}</Label>
            </div>
            
            {/* 商家结算数据 */}
            <div className="space-y-2">
              <Label className="font-medium">{t("商家结算", "Merchant Settlement")}</Label>
              <div className="ml-4 space-y-1">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="delete-balance-change-logs"
                    checked={deleteSelections.merchantSettlement.balanceChangeLogs}
                    onCheckedChange={(checked) => setDeleteSelections(prev => ({
                      ...prev,
                      merchantSettlement: { ...prev.merchantSettlement, balanceChangeLogs: checked === true }
                    }))}
                  />
                  <Label htmlFor="delete-balance-change-logs" className="text-sm">{t("变动明细 + 账本明细（提款/充值/变动记录）", "Change Logs + Ledger Transactions")}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="delete-initial-balances"
                    checked={deleteSelections.merchantSettlement.initialBalances}
                    onCheckedChange={(checked) => setDeleteSelections(prev => ({
                      ...prev,
                      merchantSettlement: { ...prev.merchantSettlement, initialBalances: checked === true }
                    }))}
                  />
                  <Label htmlFor="delete-initial-balances" className="text-sm">{t("初始余额/重置时间", "Initial Balances/Reset Times")}</Label>
                </div>
              </div>
            </div>
              </div>
            </div>
            
            {/* 其他数据 */}
            <div className="space-y-2">
              <Label className="font-medium">{t("其他数据", "Other Data")}</Label>
              <div className="ml-4 space-y-1">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="delete-referral-relations"
                    checked={deleteSelections.referralRelations}
                    onCheckedChange={(checked) => setDeleteSelections(prev => ({
                      ...prev,
                      referralRelations: checked === true
                    }))}
                  />
                  <Label htmlFor="delete-referral-relations" className="text-sm">{t("推荐关系", "Referral Relations")}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="delete-audit-records"
                    checked={deleteSelections.auditRecords}
                    onCheckedChange={(checked) => setDeleteSelections(prev => ({
                      ...prev,
                      auditRecords: checked === true
                    }))}
                  />
                  <Label htmlFor="delete-audit-records" className="text-sm">{t("审核记录", "Audit Records")}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="delete-operation-logs"
                    checked={deleteSelections.operationLogs}
                    onCheckedChange={(checked) => setDeleteSelections(prev => ({
                      ...prev,
                      operationLogs: checked === true
                    }))}
                  />
                  <Label htmlFor="delete-operation-logs" className="text-sm">{t("操作日志", "Operation Logs")}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="delete-login-logs"
                    checked={deleteSelections.loginLogs}
                    onCheckedChange={(checked) => setDeleteSelections(prev => ({
                      ...prev,
                      loginLogs: checked === true
                    }))}
                  />
                  <Label htmlFor="delete-login-logs" className="text-sm">{t("登录日志", "Login Logs")}</Label>
                </div>
              </div>
            </div>
            
            {/* 知识库数据 */}
            <div className="space-y-2">
              <Label className="font-medium">{t("知识库", "Knowledge Base")}</Label>
              <div className="ml-4 space-y-1">
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="delete-knowledge-articles"
                    checked={deleteSelections.knowledgeData.articles}
                    onCheckedChange={(checked) => setDeleteSelections(prev => ({
                      ...prev,
                      knowledgeData: { ...prev.knowledgeData, articles: checked === true }
                    }))}
                  />
                  <Label htmlFor="delete-knowledge-articles" className="text-sm">{t("知识库文章", "Knowledge Articles")}</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox 
                    id="delete-knowledge-categories"
                    checked={deleteSelections.knowledgeData.categories}
                    onCheckedChange={(checked) => setDeleteSelections(prev => ({
                      ...prev,
                      knowledgeData: { ...prev.knowledgeData, categories: checked === true }
                    }))}
                  />
                  <Label htmlFor="delete-knowledge-categories" className="text-sm">{t("知识库分类", "Knowledge Categories")}</Label>
                </div>
              </div>
            </div>
            
            {/* 保留活动数据选项 */}
            {deleteSelections.members.activityData && (
              <div className="flex items-center space-x-2 bg-warning/10 p-3 rounded border border-warning/20">
                <Checkbox 
                  id="preserve-activity-data"
                  checked={deleteSelections.preserveActivityData}
                  onCheckedChange={(checked) => setDeleteSelections(prev => ({
                    ...prev,
                    preserveActivityData: checked === true
                  }))}
                />
                <Label htmlFor="preserve-activity-data" className="text-sm">
                  {t("保留消费奖励/推荐奖励/剩余积分", "Preserve consumption/referral rewards and remaining points")}
                </Label>
              </div>
            )}
            
            {/* 管理员密码 */}
            <div className="space-y-2 pt-4 border-t">
              <Label>{t("管理员密码", "Admin Password")}</Label>
              <Input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder={t("请输入管理员密码确认删除", "Enter admin password to confirm")}
              />
            </div>
            
            {/* 删除进度 */}
            {isDeleting && (
              <div className="space-y-3 pt-4 border-t border-destructive/20">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-destructive" />
                  <span className="text-sm font-medium text-destructive">
                    {deleteProgress.total > 0 
                      ? `${t("删除进度", "Deleting")}: ${deleteProgress.current}/${deleteProgress.total}`
                      : t("准备中...", "Preparing...")}
                  </span>
                </div>
                {deleteProgress.total > 0 && (
                  <>
                    <div className="relative h-4 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full bg-gradient-to-r from-destructive to-destructive/80 transition-all duration-500 ease-out rounded-full"
                        style={{ width: `${Math.round((deleteProgress.current / deleteProgress.total) * 100)}%` }}
                      />
                      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-white mix-blend-difference">
                        {Math.round((deleteProgress.current / deleteProgress.total) * 100)}%
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="truncate max-w-[200px]">
                        {t("当前步骤", "Current step")}: {deleteProgress.currentStep}
                      </span>
                      <span className="text-destructive/70 font-medium whitespace-nowrap">
                        {t("请勿关闭页面", "Do not close this page")}
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setDeletePassword("");
            }} disabled={isDeleting}>
              {t("取消", "Cancel")}
            </AlertDialogCancel>
            <Button
              onClick={(e) => {
                e.preventDefault();
                handleDeleteData();
              }}
              variant="destructive"
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {deleteProgress.total > 0 
                    ? `${deleteProgress.current}/${deleteProgress.total} ${t("删除中...", "Deleting...")}`
                    : t("准备中...", "Preparing...")}
                </>
              ) : (
                t("确认删除", "Confirm Delete")
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Tabs>
  );
}