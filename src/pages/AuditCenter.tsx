import { useState, useEffect } from "react";
import { trackRender } from "@/lib/performanceUtils";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StickyScrollTableContainer } from "@/components/ui/sticky-scroll-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "react-router-dom";
import { RefreshCw, Check, X, Settings, Search, Loader2, Info, Globe, ShoppingBag } from "lucide-react";
import DataFieldPermissionsPanel from "@/components/DataFieldPermissionsPanel";
import { notify } from "@/lib/notifyHub";
import DateRangeFilter from "@/components/DateRangeFilter";
import { TimeRangeType, DateRange, getTimeRangeDates, filterByDateRange } from "@/lib/dateFilter";
import { loadSharedData, saveSharedData } from "@/services/finance/sharedDataService";
import { useAuth } from "@/contexts/AuthContext";
import { useFieldPermissions } from "@/hooks/staff/useFieldPermissions";
import { formatBeijingTime } from "@/lib/beijingTime";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { logOperation } from "@/services/audit/auditLogService";
import { TablePagination } from "@/components/ui/table-pagination";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuditRecords, LegacyAuditItem } from "@/hooks/audit/useAuditRecords";
import { useDebouncedValue } from "@/hooks/ui/useDebounce";
import { useIsMobile, useIsTablet } from "@/hooks/ui/use-mobile";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobileCardActions, MobilePagination, MobileEmptyState } from "@/components/ui/mobile-data-card";

import {
  type AuditSettings,
  DEFAULT_AUDIT_SETTINGS,
  mergeAuditSettings,
  auditSettingsNeedsSanitizePersist,
  ORDER_AUDIT_FIELDS,
  ORDER_OPERATION_FIELDS,
  MEMBER_AUDIT_FIELDS,
  ACTIVITY_AUDIT_FIELDS,
} from '@/lib/auditSettingsTypes';

// Audit item type - re-exported for backward compatibility
export type AuditItem = LegacyAuditItem;
export type { AuditSettings };


export default function AuditCenter() {
  trackRender('AuditCenter');
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const { employee } = useAuth();
  const { checkPermission } = useFieldPermissions();
  
  const [activeTab, setActiveTab] = useState("pending");
  const [settings, setSettings] = useState<AuditSettings>(DEFAULT_AUDIT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedItem, setSelectedItem] = useState<AuditItem | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [selectedRange, setSelectedRange] = useState<TimeRangeType>("全部");
  const [dateRange, setDateRange] = useState<DateRange>(() => getTimeRangeDates("全部"));
  
  // 服务端分页参数
  const statusFilter = activeTab === 'pending' ? 'pending' as const : activeTab === 'approved' ? 'approved' as const : activeTab === 'rejected' ? 'rejected' as const : undefined;
  const dateFrom = dateRange.start ? dateRange.start.toISOString() : undefined;
  const dateTo = dateRange.end ? dateRange.end.toISOString() : undefined;

  const debouncedSearch = useDebouncedValue(searchTerm, 400);
  const { legacyItems: auditItems, totalCount, pendingCount, loading: isLoading, refetch, approveRecord, rejectRecord, isAdmin: isAdminUser } = useAuditRecords({
    page: currentPage,
    pageSize,
    status: statusFilter,
    dateFrom,
    dateTo,
    searchTerm: debouncedSearch || undefined,
  });

  // Helper function to get field label
  const getFieldLabel = (fields: typeof ORDER_AUDIT_FIELDS, key: string) => {
    const field = fields.find(f => f.key === key);
    if (!field) return key;
    return language === 'zh' ? field.label_zh : field.label_en;
  };

  useEffect(() => {
    let cancelled = false;
    loadSharedData<AuditSettings>('auditSettings').then(async (raw) => {
      if (cancelled) return;
      const merged = mergeAuditSettings(raw);
      setSettings(merged);
      if (!auditSettingsNeedsSanitizePersist(raw)) return;
      const ok = await saveSharedData('auditSettings', merged);
      if (cancelled) return;
      if (ok) {
        notify.info(
          t(
            '已自动移除审核设置中的无效或过时勾选项并保存。若仍需对部分字段走审核，请在「审核设置」中按当前业务列表重新勾选。',
            'Removed invalid or obsolete audit selections and saved. To require approval again, re-select fields in Audit Settings using the current list.',
          ),
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, [t]);

  // Reset page when filters or pageSize change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, debouncedSearch, selectedRange, pageSize]);

  const handleRefresh = () => {
    refetch();
    notify.success(t("已刷新", "Refreshed"));
  };

  const handleDateRangeChange = (range: TimeRangeType, start?: Date, end?: Date) => {
    setSelectedRange(range);
    if (range === "自定义" && start && end) {
      setDateRange(getTimeRangeDates(range, start, end));
    } else {
      setDateRange(getTimeRangeDates(range));
    }
  };

  const isAdmin = () => {
    return employee?.role === 'admin' || !!employee?.is_super_admin;
  };

  const isSuperAdmin = () => {
    return !!employee?.is_super_admin || !!employee?.is_platform_super_admin;
  };

  /** 审核规则（勾选字段是否进入待审核）：管理员、主管、总管理员可配置 */
  const canConfigureAuditRules = () =>
    employee?.role === 'admin' ||
    employee?.role === 'manager' ||
    !!employee?.is_super_admin ||
    !!employee?.is_platform_super_admin;

  const canApprove = () => {
    if (isAdmin()) return true;
    const auditPermission = checkPermission('audit', 'can_approve');
    return auditPermission.canEdit;
  };

  const handleApprove = async (item: AuditItem) => {
    if (!canApprove()) {
      notify.error(t("权限不足，无法审核", "Insufficient permissions"));
      return;
    }

    await approveRecord(item.id);
  };

  const handleReject = (item: AuditItem) => {
    if (!canApprove()) {
      notify.error(t("权限不足，无法审核", "Insufficient permissions"));
      return;
    }
    
    setSelectedItem(item);
    setRejectReason("");
    setShowRejectDialog(true);
  };

  const confirmReject = async () => {
    if (!selectedItem) return;
    if (!rejectReason.trim()) {
      notify.error(t("请填写拒绝理由", "Please enter a rejection reason"));
      return;
    }
    await rejectRecord(selectedItem.id, rejectReason);
    setShowRejectDialog(false);
    setSelectedItem(null);
  };

  const handleSettingChange = async (module: 'order' | 'member' | 'activity' | 'orderOperation', field: string, checked: boolean) => {
    const newSettings = { ...settings };
    const fieldArray = module === 'order' ? 'orderFields' 
      : module === 'member' ? 'memberFields' 
      : module === 'activity' ? 'activityFields'
      : 'orderOperations';
    
    if (!Array.isArray(newSettings[fieldArray])) {
      newSettings[fieldArray] = [];
    }
    
    if (checked) {
      if (!newSettings[fieldArray].includes(field)) {
        newSettings[fieldArray].push(field);
      }
    } else {
      newSettings[fieldArray] = newSettings[fieldArray].filter(f => f !== field);
    }
    
    setSettings(newSettings);
    await saveSharedData('auditSettings', newSettings);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-amber-500 dark:bg-amber-600 text-white">{t("待审核", "Pending")}</Badge>;
      case 'approved':
        return <Badge className="bg-emerald-500 dark:bg-emerald-600 text-white">{t("已通过", "Approved")}</Badge>;
      case 'rejected':
        return <Badge variant="destructive">{t("已拒绝", "Rejected")}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Server-side search: auditItems already filtered by the backend
  const filteredItems = auditItems;

  const totalPages = Math.ceil(totalCount / pageSize);
  const paginatedItems = filteredItems;

  if (isLoading) {
    return <TablePageSkeleton />;
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Search, date filter and action buttons */}
      <Card className="p-3 sm:p-4 shrink-0">
        <div className={isMobile ? "space-y-2" : "flex flex-wrap items-center justify-between gap-4"}>
          <div className={isMobile ? "relative w-full" : "relative min-w-[200px] max-w-sm"}>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("搜索操作人、模块、字段...", "Search operator, module, field...")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
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
              {canConfigureAuditRules() && (
                <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
                  <Settings className="h-4 w-4" />
                  {!isMobile && <span className="ml-1">{t("审核设置", "Audit Settings")}</span>}
                </Button>
              )}
            </div>
          </div>
        </div>
        
        {/* Info message */}
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
          <Info className="h-3.5 w-3.5 shrink-0" />
          <span>
            {t(
              "左侧菜单可见性：系统设置 → 权限设置。字段能否编辑 / 是否需审核：本页「审核设置」（主管可改审核规则；总管理员可改数据编辑权限）。",
              "Sidebar: System Settings → Permissions. Field edit & audit workflow: Audit Settings on this page (managers: audit rules; super admin: data permissions).",
            )}
          </span>
        </div>

        <Alert className="mt-3 border-muted">
          <AlertDescription className="text-xs sm:text-sm text-muted-foreground space-y-2">
            <p className="font-medium text-foreground">
              {t("本页「待审核」数据来源", "What this page’s pending list covers")}
            </p>
            <p>
              {t(
                "下列记录来自「审核设置」中勾选的订单 / 会员 / 活动赠送等字段变更，写入 audit_records 后在此通过或驳回。",
                "Items here are field-level changes (orders, members, activity gifts, etc.) that your Audit Settings send into audit_records for approve/reject.",
              )}
            </p>
            <p>
              {t(
                "以下审核不在本列表中，请到对应模块处理：会员门户配置版本发布（发布管理中的提交/审批）；积分商城兑换单（订单管理 → 积分兑换，状态待处理）。",
                "These approvals are not in this list: member portal publishing (Publishing tab submit/approve); points mall redemptions (Orders → Points Mall, pending status).",
              )}
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button variant="outline" size="sm" className="h-8" asChild>
                <Link to="/staff/member-portal/publish" className="inline-flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" />
                  {t("会员门户 · 发布管理", "Member portal · Publishing")}
                </Link>
              </Button>
              <Button variant="outline" size="sm" className="h-8" asChild>
                <Link
                  to="/staff/orders?tab=mall&mallStatus=pending"
                  className="inline-flex items-center gap-1.5"
                >
                  <ShoppingBag className="h-3.5 w-3.5" />
                  {t("订单 · 积分兑换待处理", "Orders · Points mall pending")}
                </Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className={isMobile ? "grid w-full grid-cols-4 text-xs" : "grid w-full max-w-md grid-cols-4"}>
              <TabsTrigger value="pending" className="text-sm">
                {t("待审核", "Pending")} ({pendingCount})
              </TabsTrigger>
              <TabsTrigger value="approved" className="text-sm">{t("已通过", "Approved")}</TabsTrigger>
              <TabsTrigger value="rejected" className="text-sm">{t("已拒绝", "Rejected")}</TabsTrigger>
              <TabsTrigger value="all" className="text-sm">{t("全部", "All")}</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent className="space-y-4">
          {useCompactLayout ? (
            <MobileCardList>
              {paginatedItems.length === 0 ? (
                <MobileEmptyState message={t("暂无审核记录", "No audit records")} />
              ) : paginatedItems.map((item) => (
                <MobileCard key={item.id} accent={item.status === 'pending' ? 'warning' : item.status === 'approved' ? 'success' : item.status === 'rejected' ? 'danger' : 'default'}>
                  <MobileCardHeader>
                    <span className="font-medium text-sm">{item.operator}</span>
                    {getStatusBadge(item.status)}
                  </MobileCardHeader>
                  <div className="text-[11px] text-muted-foreground">
                    {formatBeijingTime(item.timestamp)}
                  </div>
                  <MobileCardRow label={t("模块", "Module")} value={item.module} />
                  <MobileCardRow label={t("订单/目标ID", "Order/Target ID")} value={item.targetDisplayId || item.targetId?.substring(0, 8) + '...' || '-'} />
                  <MobileCardRow label={t("字段", "Field")} value={item.field} />
                  <MobileCardRow label={t("原值", "Old")} value={item.oldValue || '-'} />
                  <MobileCardRow label={t("新值", "New")} value={item.newValue} highlight />
                  <MobileCardCollapsible>
                    <MobileCardRow label={t("审核人", "Reviewer")} value={item.reviewer || '-'} />
                    {item.rejectReason && <MobileCardRow label={t("原因", "Reason")} value={item.rejectReason} />}
                  </MobileCardCollapsible>
                  {item.status === 'pending' && canApprove() && (
                    <MobileCardActions>
                      <Button size="sm" variant="outline" className="flex-1 h-9 touch-manipulation text-emerald-600" onClick={() => handleApprove(item)}>
                        <Check className="h-3 w-3 mr-1" />{t("通过", "Approve")}
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 h-9 touch-manipulation text-red-600" onClick={() => handleReject(item)}>
                        <X className="h-3 w-3 mr-1" />{t("拒绝", "Reject")}
                      </Button>
                    </MobileCardActions>
                  )}
                </MobileCard>
              ))}
              <MobilePagination currentPage={currentPage} totalPages={totalPages} totalItems={totalCount} onPageChange={setCurrentPage} pageSize={pageSize} onPageSizeChange={setPageSize} />
            </MobileCardList>
          ) : (
          <>
          <StickyScrollTableContainer minWidth="1100px">
            <Table className="text-xs">
              <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                <TableRow className="bg-muted/50">
                  <TableHead className="text-center whitespace-nowrap px-1.5">{t("提交时间", "Submit Time")}</TableHead>
                  <TableHead className="text-center whitespace-nowrap px-1.5">{t("操作人", "Operator")}</TableHead>
                  <TableHead className="text-center whitespace-nowrap px-1.5">{t("模块", "Module")}</TableHead>
                  <TableHead className="text-center whitespace-nowrap px-1.5">{t("订单/目标ID", "Order/Target ID")}</TableHead>
                  <TableHead className="text-center whitespace-nowrap px-1.5">{t("字段", "Field")}</TableHead>
                  <TableHead className="text-center whitespace-nowrap px-1.5">{t("原值", "Old Value")}</TableHead>
                  <TableHead className="text-center whitespace-nowrap px-1.5">{t("新值", "New Value")}</TableHead>
                  <TableHead className="text-center whitespace-nowrap px-1.5">{t("状态", "Status")}</TableHead>
                  <TableHead className="text-center whitespace-nowrap px-1.5">{t("审核人", "Reviewer")}</TableHead>
                  <TableHead className="text-center whitespace-nowrap px-1.5 w-[100px] sticky right-0 z-20 bg-muted shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)]">{t("操作", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedItems.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-mono text-center whitespace-nowrap px-1.5">
                      {formatBeijingTime(item.timestamp)}
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap px-1.5">{item.operator}</TableCell>
                    <TableCell className="text-center whitespace-nowrap px-1.5">{item.module}</TableCell>
                    <TableCell className="font-mono text-center whitespace-nowrap px-1.5 text-muted-foreground">
                      {item.targetDisplayId || item.targetId?.substring(0, 8) + '...' || '-'}
                    </TableCell>
                    <TableCell className="text-center whitespace-nowrap px-1.5">{item.field}</TableCell>
                    <TableCell className="max-w-[150px] truncate text-center text-muted-foreground px-1.5">{item.oldValue}</TableCell>
                    <TableCell className="max-w-[150px] truncate text-center font-medium px-1.5">{item.newValue}</TableCell>
                    <TableCell className="text-center whitespace-nowrap px-1.5">{getStatusBadge(item.status)}</TableCell>
                    <TableCell className="text-center whitespace-nowrap px-1.5">{item.reviewer || '-'}</TableCell>
                    <TableCell className="text-center whitespace-nowrap px-1.5 sticky right-0 z-10 bg-background shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                      {item.status === 'pending' && canApprove() && (
                        <div className="flex gap-1 justify-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 w-9 p-0 touch-manipulation text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                            onClick={() => handleApprove(item)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-9 w-9 p-0 touch-manipulation text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                            onClick={() => handleReject(item)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                      {item.status === 'rejected' && item.rejectReason && (
                        <span className="text-xs text-muted-foreground">
                          {item.rejectReason}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {paginatedItems.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      {t("暂无审核记录", "No audit records")}
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
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={setPageSize}
            pageSizeOptions={[10, 20, 50]}
          />
          </>
          )}
        </CardContent>
      </Card>

      <DrawerDetail
        open={showSettings}
        onOpenChange={setShowSettings}
        title={t("审核设置", "Audit Settings")}
        sheetMaxWidth="3xl"
      >
          <Tabs defaultValue="rules" className="w-full">
            <TabsList className={isSuperAdmin() ? "grid w-full grid-cols-2 mb-2" : "mb-2"}>
              <TabsTrigger value="rules">{t("审核规则", "Audit rules")}</TabsTrigger>
              {isSuperAdmin() && (
                <TabsTrigger value="data-perms">{t("数据编辑权限", "Data permissions")}</TabsTrigger>
              )}
            </TabsList>
            {isSuperAdmin() && (
              <TabsContent value="data-perms" className="mt-0 space-y-3">
                <DataFieldPermissionsPanel />
              </TabsContent>
            )}
            <TabsContent value="rules" className="mt-0 space-y-6">
          
          <div className="p-3 bg-muted/50 rounded-lg border text-sm space-y-2">
            <p className="font-medium flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              {t("说明", "About")}
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-6">
              <li>{t("左侧菜单可见性在", "Sidebar visibility is configured under ")}<strong>{t("系统设置 → 权限设置", "System Settings → Permissions")}</strong></li>
              <li>{t("「数据编辑权限」页签仅总管理员可配置，用于设定各模块字段的查看/编辑/删除", "Data permissions tab is super-admin only, for field-level view/edit/delete.")}</li>
              <li>{t("本页「审核规则」勾选后：非管理员对对应字段的修改将进入待审核队列", "Rules below: checked fields go to pending audit for non-admins")}</li>
              <li>{t("下列仅列出各模块编辑流程中实际可修改并会参与审核的字段（只读项如会员编号、录入人等已不显示）", "Only fields that staff can actually change in edit dialogs are listed (read-only items such as member code or recorder are omitted).")}</li>
              <li>{t("管理员与总管理员对业务的修改一般直接生效；是否需审核以您勾选的规则为准", "Admin/super-admin changes follow the same rule toggles where applicable")}</li>
            </ul>
          </div>
          
          <div className="space-y-6">
            <div>
              <h3 className="font-medium mb-3">{t("订单管理 - 需要审核的字段", "Order Management - Fields Requiring Audit")}</h3>
              <div className="grid grid-cols-3 gap-3">
                {ORDER_AUDIT_FIELDS.map(field => (
                  <div key={field.key} className="flex items-center space-x-2">
                    <Checkbox
                      id={`order-${field.key}`}
                      checked={Array.isArray(settings.orderFields) && settings.orderFields.includes(field.key)}
                      onCheckedChange={(checked) => 
                        handleSettingChange('order', field.key, checked as boolean)
                      }
                    />
                    <Label htmlFor={`order-${field.key}`}>
                      {language === 'zh' ? field.label_zh : field.label_en}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <h3 className="font-medium mb-3">{t("订单管理 - 操作权限审核", "Order Management - Operation Audit")}</h3>
              <p className="text-xs text-muted-foreground mb-3">
                {t("勾选后，非管理员执行这些操作需要提交审核（与系统设置→权限设置不冲突）", "When checked, non-admin operations require audit (doesn't conflict with System Settings → Permissions)")}
              </p>
              <div className="grid grid-cols-3 gap-3">
                {ORDER_OPERATION_FIELDS.map(field => (
                  <div key={field.key} className="flex items-center space-x-2">
                    <Checkbox
                      id={`orderOp-${field.key}`}
                      checked={Array.isArray(settings.orderOperations) && settings.orderOperations.includes(field.key)}
                      onCheckedChange={(checked) => 
                        handleSettingChange('orderOperation', field.key, checked as boolean)
                      }
                    />
                    <Label htmlFor={`orderOp-${field.key}`}>
                      {language === 'zh' ? field.label_zh : field.label_en}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <h3 className="font-medium mb-3">{t("会员管理 - 需要审核的字段", "Member Management - Fields Requiring Audit")}</h3>
              <div className="grid grid-cols-3 gap-3">
                {MEMBER_AUDIT_FIELDS.map(field => (
                  <div key={field.key} className="flex items-center space-x-2">
                    <Checkbox
                      id={`member-${field.key}`}
                      checked={Array.isArray(settings.memberFields) && settings.memberFields.includes(field.key)}
                      onCheckedChange={(checked) => 
                        handleSettingChange('member', field.key, checked as boolean)
                      }
                    />
                    <Label htmlFor={`member-${field.key}`}>
                      {language === 'zh' ? field.label_zh : field.label_en}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border p-4 space-y-2">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="allow-manual-member-level"
                  checked={settings.allow_manual_member_level === true}
                  onCheckedChange={async (checked) => {
                    const next = { ...settings, allow_manual_member_level: checked === true };
                    setSettings(next);
                    await saveSharedData('auditSettings', next);
                  }}
                />
                <div className="space-y-1">
                  <Label htmlFor="allow-manual-member-level" className="text-sm font-medium cursor-pointer">
                    {t("允许手动修改会员等级", "Allow manual member level changes")}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {t(
                      "默认关闭：等级仅由「累计积分」与「会员晋级」规则自动计算。开启后，拥有等级字段编辑权限的管理员可在会员数据中手调等级（仍建议以自动晋级为主）。",
                      "Off by default: levels follow total points and promotion rules. When on, staff with level edit permission can override in member records.",
                    )}
                  </p>
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="font-medium mb-3">{t("活动赠送 - 需要审核的字段", "Activity Gifts - Fields Requiring Audit")}</h3>
              <div className="grid grid-cols-3 gap-3">
                {ACTIVITY_AUDIT_FIELDS.map(field => (
                  <div key={field.key} className="flex items-center space-x-2">
                    <Checkbox
                      id={`activity-${field.key}`}
                      checked={Array.isArray(settings.activityFields) && settings.activityFields.includes(field.key)}
                      onCheckedChange={(checked) => 
                        handleSettingChange('activity', field.key, checked as boolean)
                      }
                    />
                    <Label htmlFor={`activity-${field.key}`}>
                      {language === 'zh' ? field.label_zh : field.label_en}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
            </TabsContent>
          </Tabs>
          <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button onClick={() => setShowSettings(false)}>{t("完成", "Done")}</Button>
          </div>
      </DrawerDetail>

      <DrawerDetail
        open={showRejectDialog}
        onOpenChange={setShowRejectDialog}
        title={t("拒绝原因", "Rejection Reason")}
        sheetMaxWidth="xl"
      >
          <Textarea
            placeholder={t("请输入拒绝原因...", "Please enter rejection reason...")}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              {t("取消", "Cancel")}
            </Button>
            <Button variant="destructive" disabled={!rejectReason.trim()} onClick={confirmReject}>
              {t("确认拒绝", "Confirm Rejection")}
            </Button>
          </div>
      </DrawerDetail>
    </div>
  );
}
