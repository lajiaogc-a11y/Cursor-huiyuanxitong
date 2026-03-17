import { useState, useEffect, useMemo } from "react";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { RefreshCw, Check, X, Settings, Search, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import DateRangeFilter from "@/components/DateRangeFilter";
import { TimeRangeType, DateRange, getTimeRangeDates, filterByDateRange } from "@/lib/dateFilter";
import { loadSharedData, saveSharedData } from "@/services/finance/sharedDataService";
import { useAuth } from "@/contexts/AuthContext";
import { useFieldPermissions } from "@/hooks/useFieldPermissions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { logOperation } from "@/stores/auditLogStore";
import { TablePagination } from "@/components/ui/table-pagination";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuditRecords, LegacyAuditItem } from "@/hooks/useAuditRecords";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobileCardActions, MobilePagination } from "@/components/ui/mobile-data-card";

// Audit item type - re-exported for backward compatibility
export type AuditItem = LegacyAuditItem;

// Audit settings type
export interface AuditSettings {
  orderFields: string[];
  memberFields: string[];
  activityFields: string[];
  orderOperations?: string[];
}

// Bilingual field definitions
const ORDER_AUDIT_FIELDS = [
  { key: 'phone', label_zh: '电话号码', label_en: 'Phone Number' },
  { key: 'memberCode', label_zh: '会员编号', label_en: 'Member Code' },
  { key: 'cardValue', label_zh: '卡片价值', label_en: 'Card Value' },
  { key: 'paidAmount', label_zh: '实付金额', label_en: 'Paid Amount' },
  { key: 'paidForeignCurrency', label_zh: '实付外币', label_en: 'Paid Foreign Currency' },
  { key: 'foreignCurrencyRate', label_zh: '外币汇率', label_en: 'Foreign Currency Rate' },
  { key: 'paymentType', label_zh: '支付类型', label_en: 'Payment Type' },
  { key: 'cardType', label_zh: '卡片类型', label_en: 'Card Type' },
  { key: 'vendor', label_zh: '卡商', label_en: 'Card Vendor' },
  { key: 'paymentProvider', label_zh: '代付商家', label_en: 'Payment Provider' },
  { key: 'fee', label_zh: '手续费', label_en: 'Fee' },
  { key: 'currency', label_zh: '需求币种', label_en: 'Currency' },
  { key: 'remark', label_zh: '备注', label_en: 'Remark' },
];

const ORDER_OPERATION_FIELDS = [
  { key: 'cancelOrder', label_zh: '取消订单', label_en: 'Cancel Order' },
  { key: 'deleteOrder', label_zh: '删除订单', label_en: 'Delete Order' },
];

const MEMBER_AUDIT_FIELDS = [
  { key: 'name', label_zh: '姓名', label_en: 'Name' },
  { key: 'phone', label_zh: '电话号码', label_en: 'Phone Number' },
  { key: 'memberCode', label_zh: '会员编号', label_en: 'Member Code' },
  { key: 'level', label_zh: '会员等级', label_en: 'Member Level' },
  { key: 'balance', label_zh: '余额', label_en: 'Balance' },
  { key: 'status', label_zh: '状态', label_en: 'Status' },
  { key: 'remark', label_zh: '备注', label_en: 'Remark' },
];

const ACTIVITY_AUDIT_FIELDS = [
  { key: 'currency', label_zh: '赠送币种', label_en: 'Gift Currency' },
  { key: 'amount', label_zh: '赠送金额', label_en: 'Gift Amount' },
  { key: 'rate', label_zh: '汇率', label_en: 'Exchange Rate' },
  { key: 'phone', label_zh: '电话号码', label_en: 'Phone Number' },
  { key: 'paymentAgent', label_zh: '代付商家', label_en: 'Payment Provider' },
  { key: 'giftType', label_zh: '类型', label_en: 'Type' },
  { key: 'remark', label_zh: '备注', label_en: 'Remark' },
];

const DEFAULT_AUDIT_SETTINGS: AuditSettings = {
  orderFields: [],
  memberFields: [],
  activityFields: [],
  orderOperations: [],
};

// Add audit item global function
export const addAuditItem = async (item: Omit<AuditItem, 'id' | 'timestamp' | 'status'>) => {
  const settings = await loadSharedData<AuditSettings>('auditSettings') || DEFAULT_AUDIT_SETTINGS;
  
  let needsAudit = false;
  if (item.module === '订单管理') {
    needsAudit = Array.isArray(settings.orderFields) && settings.orderFields.includes(item.field);
  } else if (item.module === '会员管理') {
    needsAudit = Array.isArray(settings.memberFields) && settings.memberFields.includes(item.field);
  } else if (item.module === '活动赠送') {
    needsAudit = Array.isArray(settings.activityFields) && settings.activityFields.includes(item.field);
  }
  
  if (!needsAudit) {
    return false;
  }
  
  const items = await loadSharedData<AuditItem[]>('auditItems') || [];
  const newItem: AuditItem = {
    ...item,
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    status: 'pending',
  };
  items.unshift(newItem);
  await saveSharedData('auditItems', items);
  return true;
};

// Check if order operation needs audit
export const checkOrderOperationNeedsAudit = async (operationKey: 'cancelOrder' | 'deleteOrder'): Promise<boolean> => {
  const settings = await loadSharedData<AuditSettings>('auditSettings') || DEFAULT_AUDIT_SETTINGS;
  return Array.isArray(settings.orderOperations) && settings.orderOperations.includes(operationKey);
};

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

  const { legacyItems: auditItems, totalCount, pendingCount, loading: isLoading, refetch, approveRecord, rejectRecord, isAdmin: isAdminUser } = useAuditRecords({
    page: currentPage,
    pageSize,
    status: statusFilter,
    dateFrom,
    dateTo,
  });

  // Helper function to get field label
  const getFieldLabel = (fields: typeof ORDER_AUDIT_FIELDS, key: string) => {
    const field = fields.find(f => f.key === key);
    if (!field) return key;
    return language === 'zh' ? field.label_zh : field.label_en;
  };

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      const savedSettings = await loadSharedData<AuditSettings>('auditSettings');
      const mergedSettings = {
        ...DEFAULT_AUDIT_SETTINGS,
        ...savedSettings,
        orderFields: Array.isArray(savedSettings?.orderFields) ? savedSettings.orderFields : DEFAULT_AUDIT_SETTINGS.orderFields,
        memberFields: Array.isArray(savedSettings?.memberFields) ? savedSettings.memberFields : DEFAULT_AUDIT_SETTINGS.memberFields,
        activityFields: Array.isArray(savedSettings?.activityFields) ? savedSettings.activityFields : DEFAULT_AUDIT_SETTINGS.activityFields,
      };
      setSettings(mergedSettings);
    };
    loadSettings();
  }, []);

  // Reset page when filters or pageSize change
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchTerm, selectedRange, pageSize]);

  const handleRefresh = () => {
    refetch();
    toast.success(t("已刷新", "Refreshed"));
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
    return employee?.role === 'admin';
  };

  const canApprove = () => {
    if (isAdmin()) return true;
    const auditPermission = checkPermission('audit', 'can_approve');
    return auditPermission.canEdit;
  };

  const handleApprove = async (item: AuditItem) => {
    if (!canApprove()) {
      toast.error(t("权限不足，无法审核", "Insufficient permissions"));
      return;
    }

    await approveRecord(item.id);
  };

  const handleReject = (item: AuditItem) => {
    if (!canApprove()) {
      toast.error(t("权限不足，无法审核", "Insufficient permissions"));
      return;
    }
    
    setSelectedItem(item);
    setRejectReason("");
    setShowRejectDialog(true);
  };

  const confirmReject = async () => {
    if (!selectedItem) return;
    
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

  // 搜索过滤（客户端，仅对当前页数据）
  const filteredItems = useMemo(() => {
    if (!searchTerm) return auditItems;
    const search = searchTerm.toLowerCase();
    return auditItems.filter(item => {
      const operator = item.operator?.toLowerCase() || '';
      const module = item.module?.toLowerCase() || '';
      const field = item.field?.toLowerCase() || '';
      const oldValue = item.oldValue?.toLowerCase() || '';
      const newValue = item.newValue?.toLowerCase() || '';
      return (
        operator.includes(search) ||
        module.includes(search) ||
        field.includes(search) ||
        oldValue.includes(search) ||
        newValue.includes(search)
      );
    });
  }, [auditItems, searchTerm]);

  // 分页：服务端 totalCount，当前页展示 filteredItems
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
              {isAdmin() && (
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
          <span>{t("权限配置请前往 系统设置 → 权限设置", "For permission settings, go to System Settings → Permissions")}</span>
        </div>
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
                <p className="text-center py-8 text-muted-foreground text-sm">{t("暂无审核记录", "No audit records")}</p>
              ) : paginatedItems.map((item) => (
                <MobileCard key={item.id}>
                  <MobileCardHeader>
                    <span className="font-medium text-sm">{item.operator}</span>
                    {getStatusBadge(item.status)}
                  </MobileCardHeader>
                  <div className="text-[11px] text-muted-foreground">
                    {new Date(item.timestamp).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}
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
                      <Button size="sm" variant="outline" className="flex-1 text-emerald-600" onClick={() => handleApprove(item)}>
                        <Check className="h-3 w-3 mr-1" />{t("通过", "Approve")}
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1 text-red-600" onClick={() => handleReject(item)}>
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
                      {new Date(item.timestamp).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US')}
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
                            className="h-8 w-8 p-0 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                            onClick={() => handleApprove(item)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
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

      {/* Audit Settings Dialog */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("审核设置", "Audit Settings")}</DialogTitle>
          </DialogHeader>
          
          <div className="p-3 bg-muted/50 rounded-lg border text-sm space-y-2">
            <p className="font-medium flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              {t("审核设置与权限设置的关系", "Relationship between Audit Settings and Permission Settings")}
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-6">
              <li><strong>{t("权限设置", "Permission Settings")}</strong>{t("（系统设置 → 权限设置）控制用户是否有权限编辑字段", " (System Settings → Permissions) controls whether users can edit fields")}</li>
              <li><strong>{t("审核设置", "Audit Settings")}</strong>{t("（此页面）配置哪些字段的修改需要提交审核", " (this page) configures which field changes require audit")}</li>
              <li>{t("管理员的修改始终", "Admin changes always")}<strong>{t("直接生效", "take effect immediately")}</strong>{t("，不需要审核", ", no audit required")}</li>
              <li>{t("非管理员用户：如果权限设置中", "Non-admin users: if permission settings")}<strong>{t("没有", " don't grant")}</strong>{t("编辑权限，修改会进入审核队列", " edit permissions, changes will enter audit queue")}</li>
              <li>{t("如果两边都配置了同一字段，以", "If both configure the same field,")}<strong>{t("权限设置", "Permission Settings")}</strong>{t("为准", " takes precedence")}</li>
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
          <DialogFooter>
            <Button onClick={() => setShowSettings(false)}>{t("完成", "Done")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Reason Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("拒绝原因", "Rejection Reason")}</DialogTitle>
          </DialogHeader>
          <Textarea
            placeholder={t("请输入拒绝原因...", "Please enter rejection reason...")}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              {t("取消", "Cancel")}
            </Button>
            <Button variant="destructive" onClick={confirmReject}>
              {t("确认拒绝", "Confirm Rejection")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
