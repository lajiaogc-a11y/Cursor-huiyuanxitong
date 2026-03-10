import { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { Search, RefreshCw, Shield, Loader2, CheckCircle, XCircle, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { trackRender } from "@/lib/performanceUtils";
import { TablePagination, usePagination } from "@/components/ui/table-pagination";
import { StickyScrollTableContainer } from "@/components/ui/sticky-scroll-table";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobilePagination } from "@/components/ui/mobile-data-card";

interface LoginLog {
  id: string;
  employee_id: string;
  employee_name: string;
  login_time: string;
  ip_address: string | null;
  ip_location: string | null;
  user_agent: string | null;
  success: boolean;
  failure_reason: string | null;
}

// IP 位置缓存
const ipLocationCache = new Map<string, string>();

// 模块级数据缓存 - 避免重复加载
let cachedLogs: LoginLog[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 60000; // 缓存有效期 60 秒

export default function LoginLogs() {
  trackRender('LoginLogs');
  
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const { employee: currentEmployee } = useAuth();
  const [logs, setLogs] = useState<LoginLog[]>(() => cachedLogs || []);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(!cachedLogs);
  const [isLoadingLocations, setIsLoadingLocations] = useState(false);
  // 使用 useRef 追踪加载状态，避免触发重渲染导致 useCallback 重建
  const hasLoadedRef = useRef(!!cachedLogs);
  
  // Pagination
  const { currentPage, setCurrentPage, pageSize, setPageSize, resetPage } = usePagination(20);
  
  const isAdminOrManager = currentEmployee?.role === 'admin' || currentEmployee?.role === 'manager';

  // 获取 IP 地理位置
  const fetchIpLocation = useCallback(async (ip: string): Promise<string> => {
    if (!ip || ip === 'unknown' || ip === '127.0.0.1') {
      return '-';
    }

    // 检查缓存
    if (ipLocationCache.has(ip)) {
      return ipLocationCache.get(ip)!;
    }

    try {
      const langParam = language === 'zh' ? '&lang=zh-CN' : '';
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-ip-location?ip=${encodeURIComponent(ip)}${langParam}`
      );
      const data = await response.json();
      
      const location = data.location || '-';
      ipLocationCache.set(ip, location);
      return location;
    } catch (error) {
      console.error('Failed to fetch IP location:', error);
      return '-';
    }
  }, [language]);

  // 批量加载 IP 地理位置
  const loadIpLocations = useCallback(async (logsToUpdate: LoginLog[]) => {
    setIsLoadingLocations(true);
    
    // 获取所有唯一的 IP 地址
    const uniqueIps = [...new Set(logsToUpdate
      .map(log => log.ip_address)
      .filter((ip): ip is string => !!ip && ip !== 'unknown' && !ipLocationCache.has(ip))
    )];

    if (uniqueIps.length === 0) {
      // 所有 IP 都在缓存中，直接更新
      const updatedLogs = logsToUpdate.map(log => ({
        ...log,
        ip_location: log.ip_address ? (ipLocationCache.get(log.ip_address) || '-') : '-'
      }));
      setLogs(updatedLogs);
      cachedLogs = updatedLogs;
      setIsLoadingLocations(false);
      return;
    }

    // 并行获取所有位置（限制并发数）
    const BATCH_SIZE = 5;
    for (let i = 0; i < uniqueIps.length; i += BATCH_SIZE) {
      const batch = uniqueIps.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(ip => fetchIpLocation(ip)));
    }

    // 更新日志的位置信息
    const updatedLogs = logsToUpdate.map(log => ({
      ...log,
      ip_location: log.ip_address ? (ipLocationCache.get(log.ip_address) || '-') : '-'
    }));
    setLogs(updatedLogs);
    cachedLogs = updatedLogs;
    cacheTimestamp = Date.now();

    setIsLoadingLocations(false);
  }, [fetchIpLocation]);

  const loadLogs = useCallback(async (forceLoading = false) => {
    // 检查缓存是否有效
    const cacheValid = cachedLogs && (Date.now() - cacheTimestamp) < CACHE_TTL;
    
    if (cacheValid && !forceLoading) {
      // 使用缓存数据，不重新加载
      setLogs(cachedLogs!);
      setIsLoading(false);
      hasLoadedRef.current = true;
      return;
    }
    
    // 如果已加载过，不显示loading（避免切换页面时闪烁）
    if (!hasLoadedRef.current || forceLoading) {
      setIsLoading(true);
    }
    try {
      // 获取登录日志
      const { data: logsData, error: logsError } = await supabase
        .from('employee_login_logs')
        .select('*')
        .order('login_time', { ascending: false })
        .limit(500);

      if (logsError) throw logsError;

      // 获取员工信息用于显示姓名
      const { data: employeesData } = await supabase
        .from('employees')
        .select('id, real_name');

      const employeeMap = new Map<string, string>();
      (employeesData || []).forEach(emp => {
        employeeMap.set(emp.id, emp.real_name);
      });

      const initialLogs = (logsData || []).map(log => ({
        id: log.id,
        employee_id: log.employee_id,
        employee_name: employeeMap.get(log.employee_id) || '-',
        login_time: log.login_time,
        ip_address: log.ip_address,
        ip_location: log.ip_address ? (ipLocationCache.get(log.ip_address) || null) : null,
        user_agent: log.user_agent,
        success: log.success,
        failure_reason: log.failure_reason,
      }));

      setLogs(initialLogs);
      cachedLogs = initialLogs;
      cacheTimestamp = Date.now();
      hasLoadedRef.current = true;
      
      // 异步加载 IP 地理位置
      loadIpLocations(initialLogs);
    } catch (error) {
      console.error('Failed to load login logs:', error);
      toast.error(t('加载登录日志失败', 'Failed to load login logs'));
    } finally {
      setIsLoading(false);
    }
  }, [loadIpLocations, t]);

  useEffect(() => {
    // 首次挂载或缓存过期时加载数据
    const cacheValid = cachedLogs && (Date.now() - cacheTimestamp) < CACHE_TTL;
    if (!cacheValid) {
      loadLogs();
    } else {
      // 使用缓存数据
      setLogs(cachedLogs!);
      setIsLoading(false);
      hasLoadedRef.current = true;
    }

    // 🔧 账号切换稳定性：监听 userDataSynced 事件，清除缓存并重新加载
    const handleUserSynced = () => {
      console.log('[LoginLogs] User data synced, clearing cache and reloading');
      cachedLogs = null;
      cacheTimestamp = 0;
      hasLoadedRef.current = false;
      loadLogs(true);
    };
    window.addEventListener('userDataSynced', handleUserSynced);

    return () => {
      window.removeEventListener('userDataSynced', handleUserSynced);
    };
  }, []); // 空依赖，只在首次挂载时执行

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

  const handleRefresh = () => {
    ipLocationCache.clear(); // 清除缓存以获取最新位置
    cachedLogs = null; // 清除数据缓存
    cacheTimestamp = 0;
    loadLogs(true); // 强制显示 loading
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
          {isLoading ? (
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
                            {isLoadingLocations && !log.ip_location ? (
                              <span className="text-muted-foreground flex items-center justify-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                {t("加载中...", "Loading...")}
                              </span>
                            ) : (
                              <span className={log.ip_location && log.ip_location !== '-' ? 'text-foreground' : 'text-muted-foreground'}>
                                {log.ip_location || '-'}
                              </span>
                            )}
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
