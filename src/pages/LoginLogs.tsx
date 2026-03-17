import { useState, useEffect, useMemo } from "react";
import { TablePageSkeleton } from "@/components/skeletons/TablePageSkeleton";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Search, RefreshCw, Shield, CheckCircle, XCircle, MapPin } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { trackRender } from "@/lib/performanceUtils";
import { TablePagination, usePagination } from "@/components/ui/table-pagination";
import { StickyScrollTableContainer } from "@/components/ui/sticky-scroll-table";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobilePagination } from "@/components/ui/mobile-data-card";
import { useLoginLogs } from "@/hooks/useLoginLogs";

export default function LoginLogs() {
  trackRender('LoginLogs');

  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const { employee: currentEmployee } = useAuth();
  const { logs, isLoading, isError, refetch } = useLoginLogs(language);
  const [searchTerm, setSearchTerm] = useState("");

  // Pagination
  const { currentPage, setCurrentPage, pageSize, setPageSize, resetPage } = usePagination(20);

  const isAdminOrManager = currentEmployee?.role === 'admin' || currentEmployee?.role === 'manager';

  // Reset page when search changes
  useEffect(() => {
    resetPage();
  }, [searchTerm, resetPage]);

  const filteredLogs = useMemo(() => logs.filter(
    (log) =>
      log.employee_name.includes(searchTerm) ||
      (log.ip_address && log.ip_address.includes(searchTerm)) ||
      (log.ip_location && log.ip_location.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (log.user_agent && log.user_agent.toLowerCase().includes(searchTerm.toLowerCase()))
  ), [logs, searchTerm]);

  // Paginate filtered logs
  const totalPages = Math.ceil(filteredLogs.length / pageSize);
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  const handleRefresh = async () => {
    await refetch();
    toast.success(t("已刷新", "Refreshed"));
  };

  const formatDateTime = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'yyyy-MM-dd HH:mm:ss');
    } catch {
      return dateStr;
    }
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
    <div className="flex flex-col h-full gap-4">
      <Card className="flex-1 min-h-0 flex flex-col">
        <CardHeader className={cn("pb-4 shrink-0", useCompactLayout && "pt-3 pb-3")}>
          <div className={isMobile ? "flex items-center gap-2" : "flex items-center justify-between"}>
            {!useCompactLayout && (
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="h-5 w-5" />
                {t("登录日志", "Login Logs")}
              </CardTitle>
            )}
            <div className={cn("flex items-center gap-2", useCompactLayout && "w-full", !isMobile && "gap-3")}>
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t("搜索员工、IP、位置...", "Search employee, IP, location...")}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={isMobile ? "pl-9 w-full" : "pl-9 w-64"}
                />
              </div>
              <Button variant="outline" size="icon" onClick={handleRefresh} className="shrink-0">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 flex flex-col">
          {isError ? (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <p className="text-muted-foreground text-sm">{t("登录日志加载失败，请确保后端服务已启动", "Login logs failed to load. Please ensure backend is running.")}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
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
                    <p className="text-center py-8 text-muted-foreground text-sm">{t("暂无登录日志", "No login logs")}</p>
                  ) : paginatedLogs.map((log) => (
                    <MobileCard key={log.id}>
                      <MobileCardHeader>
                        <span className="font-medium text-sm">{log.employee_name}</span>
                        {log.success ? (
                          <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30 dark:border-green-800 text-xs">
                            <CheckCircle className="h-3 w-3 mr-0.5" />
                            {t("成功", "OK")}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50 dark:bg-red-950/30 dark:border-red-800 text-xs">
                            <XCircle className="h-3 w-3 mr-0.5" />
                            {t("失败", "Fail")}
                          </Badge>
                        )}
                      </MobileCardHeader>
                      <div className="text-[11px] text-muted-foreground">{formatDateTime(log.login_time)}</div>
                      <MobileCardRow label={t("IP地址", "IP")} value={log.ip_address || '-'} />
                      <MobileCardRow label={t("位置", "Location")} value={log.ip_location || '-'} />
                      <MobileCardCollapsible>
                        <MobileCardRow label={t("浏览器", "Browser")} value={parseUserAgent(log.user_agent)} />
                        {log.failure_reason && <MobileCardRow label={t("原因", "Reason")} value={log.failure_reason} />}
                      </MobileCardCollapsible>
                    </MobileCard>
                  ))}
                  <MobilePagination currentPage={currentPage} totalPages={totalPages} totalItems={filteredLogs.length} onPageChange={setCurrentPage} pageSize={pageSize} onPageSizeChange={setPageSize} />
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
                          <TableCell className="text-center text-muted-foreground whitespace-nowrap px-1.5">
                            {log.ip_address || '-'}
                          </TableCell>
                          <TableCell className="text-center whitespace-nowrap px-1.5">
                            <span className={log.ip_location && log.ip_location !== '-' ? 'text-foreground' : 'text-muted-foreground'}>
                              {log.ip_location || '-'}
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

              {/* Pagination */}
              <TablePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredLogs.length}
                pageSize={pageSize}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
                pageSizeOptions={[10, 20, 50, 100]}
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
