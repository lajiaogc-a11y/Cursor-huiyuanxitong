import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { Search, RefreshCw, CheckCircle, XCircle, MapPin, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { notify } from "@/lib/notifyHub";
import { formatBeijingTime } from "@/lib/beijingTime";
import { useAuth } from "@/contexts/AuthContext";
import { trackRender } from "@/lib/performanceUtils";
import { TablePagination } from "@/components/ui/table-pagination";
import { StickyScrollTableContainer } from "@/components/ui/sticky-scroll-table";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobilePagination, MobileEmptyState } from "@/components/ui/mobile-data-card";
import { MobileFilterBar } from "@/components/ui/mobile-filter-bar";
import { useLoginLogs } from "@/hooks/useLoginLogs";
import { useTenantView } from "@/contexts/TenantViewContext";
import { PageHeader, PageActions, FilterBar, KPIGrid, ErrorState } from "@/components/common";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MemberLoginLogsTab } from "@/pages/member-portal/MemberLoginLogsTab";

function loginLogsTabFromSearch(sp: URLSearchParams): "staff" | "member" {
  return sp.get("tab") === "member" ? "member" : "staff";
}

function StaffLoginLogsPanel({ enabled, language }: { enabled: boolean; language: string }) {
  trackRender("StaffLoginLogsPanel");

  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const { employee: currentEmployee } = useAuth();
  const { viewingTenantName } = useTenantView() || {};
  const {
    logs,
    isLoading,
    isError,
    refetch,
    currentPage,
    setCurrentPage,
    totalLogs,
    totalPages: serverTotalPages,
    pageSize,
    effectiveTenantId,
  } = useLoginLogs(language, { enabled });
  const isPlatformSuperAdmin = !!currentEmployee?.is_platform_super_admin;
  const platformScopedToEnteredTenant = isPlatformSuperAdmin && !!viewingTenantName?.trim();
  const [searchTerm, setSearchTerm] = useState("");

  const formatIpAddress = (ip: string | null): string => {
    if (!ip) return '-';
    if (ip.includes(':') && ip.length > 20) {
      const parts = ip.split(':');
      return parts.slice(0, 3).join(':') + ':...' + parts.slice(-1).join(':');
    }
    return ip;
  };

  const isAdminOrManager = currentEmployee?.role === 'admin' || currentEmployee?.role === 'manager';

  // 服务端分页：本地搜索在当前页结果内过滤
  const filteredLogs = useMemo(() => {
    if (!searchTerm) return logs;
    return logs.filter(
      (log) =>
        log.employee_name.includes(searchTerm) ||
        (log.ip_address && log.ip_address.includes(searchTerm)) ||
        String(log.ip_location ?? '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(log.user_agent ?? '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [logs, searchTerm]);

  const totalPages = serverTotalPages;
  const paginatedLogs = filteredLogs;

  const loginKpiItems = useMemo(() => {
    const ok = paginatedLogs.filter((l) => l.success).length;
    const fail = paginatedLogs.filter((l) => !l.success).length;
    return [
      { label: t("总记录数（服务端）", "Total (server)"), value: String(totalLogs) },
      { label: t("本页成功", "OK this page"), value: String(ok) },
      { label: t("本页失败", "Failed this page"), value: String(fail) },
      { label: t("本页条数", "Rows this page"), value: String(paginatedLogs.length) },
    ];
  }, [totalLogs, paginatedLogs, t]);

  const handleRefresh = async () => {
    await refetch();
    notify.success(t("已刷新", "Refreshed"));
  };

  const formatDateTime = (dateStr: string) => {
    const result = formatBeijingTime(dateStr);
    return result || dateStr;
  };

  // 解析User-Agent获取浏览器信息
  const parseUserAgent = (ua: string | null): string => {
    if (!ua) return '-';

    const isZh = language === 'zh';

    if (ua.includes('Chrome') && !ua.includes('Edge')) {
      const match = ua.match(/Chrome\/(\d+)/);
      const ver = match ? ` ${match[1]}` : '';
      return isZh ? `谷歌浏览器${ver}` : `Chrome${ver}`;
    }
    if (ua.includes('Firefox')) {
      const match = ua.match(/Firefox\/(\d+)/);
      const ver = match ? ` ${match[1]}` : '';
      return isZh ? `火狐浏览器${ver}` : `Firefox${ver}`;
    }
    if (ua.includes('Safari') && !ua.includes('Chrome')) {
      const match = ua.match(/Version\/(\d+)/);
      const ver = match ? ` ${match[1]}` : '';
      return isZh ? `Safari 浏览器${ver}` : `Safari${ver}`;
    }
    if (ua.includes('Edge') || ua.includes('Edg')) {
      const match = ua.match(/(?:Edge|Edg)\/(\d+)/);
      const ver = match ? ` ${match[1]}` : '';
      return isZh ? `Edge 浏览器${ver}` : `Edge${ver}`;
    }

    return ua.substring(0, 30) + (ua.length > 30 ? '...' : '');
  };

  return (
    <div className="flex h-full flex-col gap-4">
      {isPlatformSuperAdmin && (
        <Alert className="shrink-0 border-primary/30 bg-muted/40">
          <Info className="h-4 w-4" />
          <AlertTitle className="text-sm">
            {t("使用说明（平台超管）", "Notes for platform super admins")}
          </AlertTitle>
          <AlertDescription className="mt-1.5 space-y-2 text-xs text-muted-foreground">
            <p>
              {t(
                "在「租户管理」中点进某个租户后，本页仅显示该租户员工的登录记录；在总后台未进入租户时，显示全部员工登录记录。",
                "After opening a tenant from Tenant Management, this page shows only that tenant’s staff logins; when you are not inside a tenant view, all staff login records are shown.",
              )}
            </p>
            <p className="font-medium text-foreground">
              {platformScopedToEnteredTenant
                ? language === "zh"
                  ? `当前数据范围：仅「${viewingTenantName ?? ""}」租户（tenant_id=${effectiveTenantId ?? ""}）`
                  : `Current scope: tenant “${viewingTenantName ?? ""}” only (tenant_id=${effectiveTenantId ?? ""})`
                : t(
                    "当前数据范围：全部租户的员工登录记录",
                    "Current scope: all tenants’ staff login records",
                  )}
            </p>
            <p>
              {t(
                "若需再区分「只看平台租户自身账号」，可后续加筛选条件；需要时可提出需求。",
                "A future filter for “platform tenant accounts only” can be added on request.",
              )}
            </p>
          </AlertDescription>
        </Alert>
      )}

      <PageHeader
        description={t(
          "员工后台登录审计（employee_login_logs）：成功/失败、IP、浏览器；服务端分页。与会员端登录表无关。",
          "Staff sign-in audit (employee_login_logs): success/failure, IP, browser; server-paged. Separate from member login logs.",
        )}
        actions={
          !useCompactLayout ? (
            <PageActions>
              <Button variant="outline" size="icon" onClick={handleRefresh} aria-label={t("刷新", "Refresh")}>
                <RefreshCw className="h-4 w-4" />
              </Button>
            </PageActions>
          ) : undefined
        }
      />

      <KPIGrid items={loginKpiItems} />

      {!useCompactLayout && (
        <FilterBar>
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative min-w-0 max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t("搜索员工、IP、位置...", "Search employee, IP, location...")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </FilterBar>
      )}

      <Card className="flex min-h-0 flex-1 flex-col">
        {useCompactLayout && (
          <CardHeader className="shrink-0 px-2.5 pb-2 pt-2">
            <MobileFilterBar
              searchValue={searchTerm}
              onSearchChange={setSearchTerm}
              placeholder={t("搜索员工、IP、位置...", "Search employee, IP, location...")}
              onRefresh={handleRefresh}
            />
          </CardHeader>
        )}
        <CardContent className="flex min-h-0 flex-1 flex-col">
          {isError ? (
            <div className="flex flex-col gap-4 py-8">
              <ErrorState
                title={t("登录日志加载失败", "Login logs failed to load")}
                description={t("请确保后端服务已启动后重试。", "Ensure the backend is running, then retry.")}
              />
              <Button variant="outline" size="sm" className="w-fit" onClick={() => refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {t("重试", "Retry")}
              </Button>
            </div>
          ) : isLoading ? (
            <TablePageSkeleton columns={5} rows={6} showTitle={false} />
          ) : (
            <>
              {useCompactLayout ? (
                <MobileCardList>
                  {paginatedLogs.length === 0 ? (
                    <MobileEmptyState message={t("暂无登录日志", "No login logs")} />
                  ) : paginatedLogs.map((log) => (
                    <MobileCard key={log.id} accent={log.success ? "success" : "danger"}>
                      <MobileCardHeader>
                        <div className="min-w-0">
                          <span className="font-medium text-sm block truncate">{log.employee_name}</span>
                          <span className="text-[11px] text-muted-foreground">{formatDateTime(log.login_time)}</span>
                        </div>
                        {log.success ? (
                          <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-800 text-[11px] shrink-0">
                            <CheckCircle className="h-3 w-3 mr-0.5" />
                            {t("成功", "OK")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 text-[11px] shrink-0">
                            <XCircle className="h-3 w-3 mr-0.5" />
                            {t("失败", "Fail")}
                          </Badge>
                        )}
                      </MobileCardHeader>
                      <MobileCardRow label={t("IP地址", "IP")} value={formatIpAddress(log.ip_address)} mono />
                      <MobileCardRow label={t("位置", "Location")} value={log.ip_location || (log.ip_address ? t('解析中...', 'Resolving...') : '-')} />
                      <MobileCardCollapsible>
                        <MobileCardRow label={t("浏览器", "Browser")} value={parseUserAgent(log.user_agent)} />
                        {log.failure_reason && <MobileCardRow label={t("原因", "Reason")} value={log.failure_reason} />}
                      </MobileCardCollapsible>
                    </MobileCard>
                  ))}
                  <MobilePagination currentPage={currentPage} totalPages={totalPages} totalItems={totalLogs} onPageChange={setCurrentPage} pageSize={pageSize} />
                </MobileCardList>
              ) : (
              <>
              <StickyScrollTableContainer minWidth="900px">
                <Table className="text-xs">
                  <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-center whitespace-nowrap px-1.5">{t("登录时间", "Login Time")}</TableHead>
                      <TableHead className="text-center whitespace-nowrap px-1.5">{t("员工姓名", "Employee")}</TableHead>
                      <TableHead className="text-center whitespace-nowrap px-1.5">{t("IP地址", "IP Address")}</TableHead>
                      <TableHead className="text-center whitespace-nowrap px-1.5">
                        <div className="flex items-center justify-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {t("登录位置", "Location")}
                        </div>
                      </TableHead>
                      <TableHead className="text-center whitespace-nowrap px-1.5">{t("浏览器", "Browser")}</TableHead>
                      <TableHead className="text-center whitespace-nowrap px-1.5">{t("状态", "Status")}</TableHead>
                      <TableHead className="text-center whitespace-nowrap px-1.5">{t("备注", "Remarks")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          {t("暂无登录日志", "No login logs")}
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-center whitespace-nowrap px-1.5">
                            {formatDateTime(log.login_time)}
                          </TableCell>
                          <TableCell className="text-center font-medium whitespace-nowrap px-1.5">
                            {log.employee_name}
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground whitespace-nowrap px-1.5" title={log.ip_address || undefined}>
                            {formatIpAddress(log.ip_address)}
                          </TableCell>
                          <TableCell className="text-center whitespace-nowrap px-1.5">
                            <span className={log.ip_location ? 'text-foreground' : 'text-muted-foreground'}>
                              {log.ip_location || (log.ip_address ? t('解析中...', 'Resolving...') : '-')}
                            </span>
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground whitespace-nowrap px-1.5">
                            {parseUserAgent(log.user_agent)}
                          </TableCell>
                          <TableCell className="text-center whitespace-nowrap px-1.5">
                            {log.success ? (
                              <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-800">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                {t("成功", "Success")}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800">
                                <XCircle className="h-3 w-3 mr-1" />
                                {t("失败", "Failed")}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center text-muted-foreground whitespace-nowrap px-1.5">
                            {log.failure_reason || '-'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </StickyScrollTableContainer>

              {/* Pagination - 服务端分页 */}
              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalLogs}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                pageSizeOptions={[50, 100, 200]}
              />
              </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginLogs() {
  trackRender("LoginLogs");
  const { t, language } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => loginLogsTabFromSearch(searchParams));

  useEffect(() => {
    setActiveTab(loginLogsTabFromSearch(searchParams));
  }, [searchParams]);

  const handleLoginLogsTabChange = (value: string) => {
    const next = value === "member" ? "member" : "staff";
    setActiveTab(next);
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        if (next === "staff") n.delete("tab");
        else n.set("tab", next);
        return n;
      },
      { replace: true },
    );
  };

  return (
    <div className="flex h-full flex-col gap-4">
      <Tabs value={activeTab} onValueChange={handleLoginLogsTabChange} className="flex h-full flex-col gap-2">
        <TabsList className="flex h-auto min-h-9 shrink-0 flex-wrap gap-1">
          <TabsTrigger value="staff">{t("员工端登录", "Staff sign-in")}</TabsTrigger>
          <TabsTrigger value="member">{t("会员端登录", "Member sign-in")}</TabsTrigger>
        </TabsList>
        <TabsContent value="staff" className="mt-0 flex flex-1 flex-col gap-4">
          <StaffLoginLogsPanel enabled={activeTab === "staff"} language={language} />
        </TabsContent>
        <TabsContent value="member" className="mt-0 flex flex-1 flex-col gap-4">
          <PageHeader
            description={t(
              "会员在门户登录成功时写入 member_login_logs（不含失败尝试）；与「员工端登录」完全独立，亦非会员系统「登录设置」配置页。",
              "Successful member portal sign-ins (member_login_logs). No failed attempts. Separate from staff logs and from the member portal login branding settings.",
            )}
          />
          <MemberLoginLogsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
