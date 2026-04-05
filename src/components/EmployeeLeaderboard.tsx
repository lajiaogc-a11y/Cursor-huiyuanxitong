import { useMemo, useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trophy, Medal, Award, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import { listEmployeesApi } from "@/api/employees";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { getMyTenantOrdersFull, getMyTenantUsdtOrdersFull, getTenantOrdersFull, getTenantUsdtOrdersFull } from "@/services/tenantService";
import { Skeleton } from "@/components/ui/skeleton";
import { safeToFixed } from "@/lib/safeCalc";

interface LeaderboardEntry {
  employeeId: string;
  employeeName: string;
  orderCount: number;
  profitNgn: number;
  profitUsdt: number;
}

export default function EmployeeLeaderboard() {
  const { t } = useLanguage();
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;
  const useMyTenantRpc = !!(effectiveTenantId && employee?.tenant_id && effectiveTenantId === employee.tenant_id);
  const [data, setData] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Only admin/manager can see leaderboard
  const canView = employee?.role === 'admin' || employee?.role === 'manager';

  const loadLeaderboard = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setLoadError(false);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

      const [normalOrders, usdtOrders] = (effectiveTenantId && !useMyTenantRpc)
        ? await Promise.all([getTenantOrdersFull(effectiveTenantId), getTenantUsdtOrdersFull(effectiveTenantId)])
        : await Promise.all([getMyTenantOrdersFull(), getMyTenantUsdtOrdersFull()]);
      const allOrders = [...(normalOrders || []), ...(usdtOrders || [])]
        .filter((o: any) => !o.is_deleted && new Date(o.created_at) >= startOfMonth);
      const employeesList = await listEmployeesApi(effectiveTenantId ? { tenant_id: effectiveTenantId } : undefined);
      const employees = employeesList.filter((e) => e.status === "active");

      const orders = allOrders;

      const getOrderEmpId = (o: any) => o.creator_id || o.employee_id || o.sales_user_id || '';
      const entries: LeaderboardEntry[] = employees.map(emp => {
        const empOrders = orders.filter(o => getOrderEmpId(o) === emp.id);
        const profitNgn = empOrders
          .filter(o => o.currency !== "USDT")
          .reduce((s, o) => s + (Number(o.profit_ngn) || 0), 0);
        const profitUsdt = empOrders
          .filter(o => o.currency === "USDT")
          .reduce((s, o) => s + (Number(o.profit_usdt) || 0), 0);
        return {
          employeeId: emp.id,
          employeeName: emp.real_name,
          orderCount: empOrders.length,
          profitNgn,
          profitUsdt,
        };
      }).filter(e => e.orderCount > 0)
        .sort((a, b) => b.orderCount - a.orderCount);

      setData(entries);
    } catch (err) {
      console.error("Leaderboard load error:", err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [canView, effectiveTenantId, useMyTenantRpc]);

  useEffect(() => {
    if (!canView) {
      setLoading(false);
      return;
    }
    loadLeaderboard();
  }, [canView, loadLeaderboard]);

  useEffect(() => {
    if (!canView) return;
    const handler = () => loadLeaderboard();
    const onDataRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ table?: string }>).detail;
      if (detail?.table === 'orders') {
        handler();
      }
    };
    window.addEventListener('leaderboard-refresh', handler);
    window.addEventListener('report-cache-invalidate', handler);
    window.addEventListener('data-refresh', onDataRefresh as EventListener);
    return () => {
      window.removeEventListener('leaderboard-refresh', handler);
      window.removeEventListener('report-cache-invalidate', handler);
      window.removeEventListener('data-refresh', onDataRefresh as EventListener);
    };
  }, [canView, loadLeaderboard]);

  if (!canView) return null;

  const getRankIcon = (index: number) => {
    if (index === 0) return <Trophy className="h-4 w-4 text-yellow-500" />;
    if (index === 1) return <Medal className="h-4 w-4 text-gray-400" />;
    if (index === 2) return <Award className="h-4 w-4 text-amber-600" />;
    return <span className="text-xs font-bold text-muted-foreground w-4 text-center">{index + 1}</span>;
  };

  const displayData = expanded ? data : data.slice(0, 5);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="flex items-center justify-center h-6 w-6 rounded-md bg-yellow-500/10">
            <Trophy className="h-3.5 w-3.5 text-yellow-500" />
          </div>
          {t("本月员工排行", "Monthly Employee Ranking")}
          <Badge variant="secondary" className="text-[10px] ml-auto">
            {t("本月", "This Month")}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
          </div>
        ) : loadError ? (
          <div className="text-center py-4">
            <p className="text-sm text-destructive mb-2">{t("加载失败", "Failed to load")}</p>
            <Button variant="outline" size="sm" onClick={() => loadLeaderboard()}>
              {t("重试", "Retry")}
            </Button>
          </div>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {t("暂无数据", "No data")}
          </p>
        ) : (
          <>
            <div className="space-y-1">
              {displayData.map((entry, i) => (
                <div
                  key={entry.employeeId}
                  className={`flex items-center gap-3 px-2 py-1.5 rounded-md transition-colors ${
                    i < 3 ? "bg-muted/50" : ""
                  }`}
                >
                  <div className="w-5 flex justify-center shrink-0">{getRankIcon(i)}</div>
                  <span className="text-sm font-medium flex-1 truncate">{entry.employeeName}</span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground tabular-nums min-w-[40px] text-right">
                      {entry.orderCount} {t("单", "orders")}
                    </span>
                    <span className="text-xs font-semibold text-success tabular-nums min-w-[60px] text-right">
                      ₦{safeToFixed(entry.profitNgn, 0)}
                    </span>
                    <span className="text-xs font-semibold tabular-nums min-w-[50px] text-right" style={{ color: 'hsl(var(--chart-3))' }}>
                      ${safeToFixed(entry.profitUsdt, 2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            {data.length > 5 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mt-2 mx-auto transition-colors"
              >
                {expanded ? (
                  <><ChevronUp className="h-3 w-3" />{t("收起", "Collapse")}</>
                ) : (
                  <><ChevronDown className="h-3 w-3" />{t(`查看全部 ${data.length} 人`, `View all ${data.length}`)}</>
                )}
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
