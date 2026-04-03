import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Lock, Trash2, Download, Bell } from "lucide-react";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { bulkDeleteApi, verifyAdminPasswordApi } from '@/services/admin/adminApiService';
import DataExportImportTab from "./DataExportImportTab";
import MemoSettingsTab from "./MemoSettingsTab";
import { notify } from "@/lib/notifyHub";
import { useLanguage } from "@/contexts/LanguageContext";
import { isProductionLocked } from "@/stores/productionLockStore";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { logOperation } from "@/stores/auditLogStore";
import { queryClient } from "@/lib/queryClient";
import { notifyDataMutation } from "@/services/system/dataRefreshManager";
import {
  DataManagementDeleteDialog,
  type DeleteBulkSelections,
} from "@/components/DataManagementDeleteDialog";
import { MemberPortalInviteMemberCleanupPanel } from "@/components/MemberPortalInviteMemberCleanupPanel";
import { ActivityDataRetentionPanel } from "@/components/ActivityDataRetentionPanel";
import { Separator } from "@/components/ui/separator";

export default function DataManagementTab() {
  const { t } = useLanguage();
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const [searchParams, setSearchParams] = useSearchParams();
  const tenantIdForCleanup = viewingTenantId || employee?.tenant_id || null;
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const [activeTab, setActiveTab] = useState("exportImport");
  
  const [productionLocked, setProductionLocked] = useState(isProductionLocked());
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ current: 0, total: 0, currentStep: '' });
  
  // 数据删除对话框状态
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteRetainMonths, setDeleteRetainMonths] = useState("1");
  const [deleteSelections, setDeleteSelections] = useState<DeleteBulkSelections>({
    orders: false,
    recycleActivityDataOnOrderDelete: true, // 删除订单时回收活动数据（累积次数、累积利润等），默认开启以符合用户预期
    reports: {
      employee: false,
      card: false,
      vendor: false,
      daily: false,
    },
    members: {
      memberManagement: false,
      activityLotteryLogs: false,
      activityCheckIns: false,
      activitySpinOrder: false,
      activitySpinShare: false,
      activitySpinInvite: false,
      activitySpinOther: false,
      activityMemberSummary: false,
      activityGift: false,
      pointsLedger: false,
    },
    // 新增的数据表选项
    shiftData: {
      shiftHandovers: false,  // 交班记录
      shiftReceivers: false,  // 接班人列表
    },
    merchantSettlement: {
      balanceChangeLogs: false,  // 变动明细 + 账本明细（ledger / balance_change_logs）
      initialBalances: false,    // shared_data_store：cardMerchantSettlements / paymentProviderSettlements（含初始余额、提款/充值、重置与历史）
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
    setProductionLocked(isProductionLocked());
  }, []);

  useEffect(() => {
    if (searchParams.get("dataDeleteFocus") !== "1") return;
    setActiveTab("deleteData");
    const next = new URLSearchParams(searchParams);
    next.delete("dataDeleteFocus");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // 删除数据函数 - 通过 Backend API 执行（adminApiService.bulkDeleteApi）
  const handleDeleteData = async () => {
    if (!deletePassword) {
      notify.error(t("请输入管理员密码", "Please enter admin password"));
      return;
    }
    
    // 验证管理员密码 - 通过数据库验证
    const isAdmin = employee?.role === 'admin' || !!employee?.is_super_admin || !!employee?.is_platform_super_admin;
    if (!isAdmin) {
      notify.error(t("需要管理员权限", "Admin permission required"));
      return;
    }
    
    const passwordValid = await verifyAdminPasswordApi(deletePassword);
    if (!passwordValid) {
      notify.error(t("管理员密码错误", "Invalid admin password"));
      return;
    }
    
    setIsDeleting(true);
    setDeleteProgress({ current: 1, total: 1, currentStep: t('删除中...', 'Deleting...') });
    
    try {
      const retainMonths = parseInt(deleteRetainMonths);
      const result = await bulkDeleteApi({
        password: deletePassword,
        retainMonths,
        deleteSelections,
      });
      const deletedSummary = result?.deletedSummary ?? [];
      const errors = result?.errors ?? [];
      const warnings = result?.warnings ?? [];
      const totalCount = deletedSummary.reduce((acc: number, s: { count: number }) => acc + s.count, 0);
      const hasOrdersOrMembers = deletedSummary.some((s: { table: string }) => s.table === '订单' || s.table === '会员');
      const hasOrders = deletedSummary.some((s: { table: string }) => s.table === '订单');
      const hasMembers = deletedSummary.some((s: { table: string }) => s.table === '会员');
      
      // ===== 记录批量删除操作日志 =====
      const isPartialSuccess = errors.length > 0 && totalCount > 0;
      if (deletedSummary.length > 0) {
        const summaryText = deletedSummary.map(s => `${s.table}: ${s.count}条`).join(', ');
        logOperation(
          'system_settings',
          'delete',
          'batch_data_cleanup',
          {
            retainMonths: retainMonths === 0 ? 0 : retainMonths,
            cutoffDate: retainMonths === 0 ? '全部' : new Date().toISOString(),
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
            },
            partial: isPartialSuccess,
            errorCount: errors.length,
          },
          { deletedSummary, totalCount, errors: isPartialSuccess ? errors : undefined },
          isPartialSuccess
            ? `批量数据删除（部分成功）: 删除 ${totalCount} 条，${errors.length} 项失败 (${summaryText})`
            : `批量数据删除: 共删除 ${totalCount} 条记录 (${summaryText})`
        );
      }
      
      // 无论是否有部分错误，只要有成功删除就刷新相关缓存
      if (totalCount > 0 || deletedSummary.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['dashboard-trend'] });
        queryClient.invalidateQueries({ queryKey: ['profit-compare-current'] });
        queryClient.invalidateQueries({ queryKey: ['profit-compare-previous'] });
        if (hasOrders) {
          void queryClient.invalidateQueries({ queryKey: ['orders'] });
          void queryClient.invalidateQueries({ queryKey: ['usdt-orders'] });
          void queryClient.invalidateQueries({ queryKey: ['order-stats'] });
          notifyDataMutation({ table: 'orders', operation: 'DELETE', source: 'manual' }).catch(console.error);
        }
        if (hasMembers) {
          void queryClient.invalidateQueries({ queryKey: ['members'] });
          void queryClient.invalidateQueries({ queryKey: ['member-activity-page-data'] });
          void queryClient.invalidateQueries({ queryKey: ['activity-data-content'] });
          notifyDataMutation({ table: 'members', operation: 'DELETE', source: 'manual' }).catch(console.error);
        }
        const mSel = deleteSelections.members;
        if (
          totalCount > 0 &&
          mSel &&
          (mSel.activityLotteryLogs ||
            mSel.activityCheckIns ||
            mSel.activitySpinOrder ||
            mSel.activitySpinShare ||
            mSel.activitySpinInvite ||
            mSel.activitySpinOther ||
            mSel.activityMemberSummary ||
            mSel.activityGift)
        ) {
          void queryClient.invalidateQueries({ queryKey: ['member-activity-page-data'] });
          void queryClient.invalidateQueries({ queryKey: ['activity-data-content'] });
        }
        if (deleteSelections.merchantSettlement?.balanceChangeLogs) {
          queryClient.invalidateQueries({ queryKey: ['merchant-settlement'] });
          queryClient.invalidateQueries({ queryKey: ['points-ledger'] });
          queryClient.invalidateQueries({ queryKey: ['activity-data-content'] });
          queryClient.invalidateQueries({ queryKey: ['shared-config'] });
          notifyDataMutation({ table: 'ledger_transactions', operation: 'DELETE', source: 'manual' }).catch(console.error);
          notifyDataMutation({ table: 'balance_change_logs', operation: 'DELETE', source: 'manual' }).catch(console.error);
          notifyDataMutation({ table: 'shared_data_store', operation: 'UPDATE', source: 'manual' }).catch(console.error);
          import('@/stores/merchantSettlementStore').then((m) => m.forceRefreshSettlementCache()).catch((err) => { console.warn('[DataManagementTab] forceRefreshSettlementCache failed:', err); return undefined; });
        }
        if (deleteSelections.merchantSettlement?.initialBalances) {
          queryClient.invalidateQueries({ queryKey: ['shared-config'] });
          queryClient.invalidateQueries({ queryKey: ['merchant-settlement'] });
          import('@/stores/merchantSettlementStore').then(m => m.resetSettlementCache()).catch(() => { /* cache reset is non-critical */ });
          notifyDataMutation({ table: 'shared_data_store', operation: 'DELETE', source: 'manual' }).catch(console.error);
        }
        if (deleteSelections.members?.pointsLedger) {
          queryClient.invalidateQueries({ queryKey: ['points-ledger'] });
        }
        if (deleteSelections.referralRelations) {
          queryClient.invalidateQueries({ queryKey: ['referral-relations'] });
        }
        if (deleteSelections.auditRecords) {
          queryClient.invalidateQueries({ queryKey: ['audit-records'] });
        }
        if (deleteSelections.operationLogs) {
          queryClient.invalidateQueries({ queryKey: ['operation-logs'] });
        }
        if (deleteSelections.loginLogs) {
          queryClient.invalidateQueries({ queryKey: ['login-logs'] });
        }
      }

      const errMsg = errors.slice(0, 3).join('; ') + (errors.length > 3 ? '...' : '');
      const warnMsg = warnings.slice(0, 3).join('; ') + (warnings.length > 3 ? '...' : '');
      if (errors.length > 0) {
        console.error('Delete data errors:', errors);
        if (totalCount > 0 || deletedSummary.length > 0) {
          notify.warning(
            t(
              `已删除 ${totalCount} 条记录，但部分步骤失败：${errMsg}。请检查数据完整性后决定是否重试。`,
              `Deleted ${totalCount} records; some steps failed: ${errMsg}. Review data integrity before retrying.`
            )
          );
        } else {
          notify.error(t(`删除失败: ${errMsg}`, `Deletion failed: ${errMsg}`));
        }
      } else {
        notify.success(t(
          `数据删除成功，共删除 ${totalCount} 条记录`,
          `Data deleted successfully, ${totalCount} records removed`
        ));
        if (warnings.length > 0) {
          console.warn('Delete data warnings:', warnings);
          notify.warning(
            t(`注意：${warnMsg}`, `Note: ${warnMsg}`)
          );
        }
        setIsDeleteDialogOpen(false);
        setDeletePassword("");
      }
    } catch (error: unknown) {
      console.error('Delete data error:', error);
      const errDetail = error instanceof Error ? error.message : String(error);
      notify.error(t(`删除数据失败: ${errDetail}`, `Failed to delete data: ${errDetail}`));
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

      {/* 权限设置Tab已移除，权限设置在系统设置里单独的权限设置Tab中 */}

      {/* 数据删除：会员门户清理 + 活动保留 + 全站批量删除 */}
      <TabsContent value="deleteData">
        <div className="space-y-8">
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {t(
                "与会员系统、活动数据相关的清理能力已集中于此，便于统一管理与审计。",
                "Member portal and activity cleanups are centralized here for consistent governance.",
              )}
            </p>
          </div>

          <MemberPortalInviteMemberCleanupPanel tenantId={tenantIdForCleanup} />

          <Separator className="my-2" />

          <ActivityDataRetentionPanel tenantId={tenantIdForCleanup} />

          <Separator className="my-2" />

          <Card>
            <CardHeader className="pb-4">
              <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                <Trash2 className="h-5 w-5" />
                {t("批量删除业务数据", "Bulk delete business data")}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                {t(
                  "按模块勾选订单、会员、交班、结算、日志等；支持按时间保留或全部删除。需管理员密码。",
                  "Select modules (orders, members, shifts, settlement, logs, etc.); retain by age or delete all. Admin password required.",
                )}
              </p>
            </CardHeader>
            <CardContent>
              <Button variant="destructive" className="gap-2" onClick={() => setIsDeleteDialogOpen(true)}>
                <Trash2 className="h-4 w-4" />
                {t("打开批量删除对话框", "Open bulk delete dialog")}
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
            "数据管理设置仅作为规则配置。数据保留策略需配合后端定时任务执行。报表标题等修改后需刷新页面生效。",
            "Data management settings are for configuration only. Retention policies require backend scheduled tasks. Report title changes take effect after page refresh."
          )}
        </div>
      )}

      <DataManagementDeleteDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        t={t}
        deleteRetainMonths={deleteRetainMonths}
        setDeleteRetainMonths={setDeleteRetainMonths}
        deleteSelections={deleteSelections}
        setDeleteSelections={setDeleteSelections}
        deletePassword={deletePassword}
        setDeletePassword={setDeletePassword}
        isDeleting={isDeleting}
        deleteProgress={deleteProgress}
        onConfirmDelete={handleDeleteData}
      />
    </Tabs>
  );
}