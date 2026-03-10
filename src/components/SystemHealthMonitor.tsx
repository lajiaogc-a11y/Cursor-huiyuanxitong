import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Activity, Database, RefreshCw, CheckCircle2, AlertTriangle, XCircle, Clock, Gauge } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

interface TableStats {
  name: string;
  label: string;
  count: number;
}

interface WebVitalStat {
  metric_name: string;
  avg_value: number;
  p75_value: number;
  good_count: number;
  total_count: number;
}

interface HealthStatus {
  dbConnected: boolean;
  latencyMs: number;
  tables: TableStats[];
  recentErrors: number;
  lastChecked: Date;
  webVitals: WebVitalStat[];
}

export default function SystemHealthMonitor() {
  const { t } = useLanguage();
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const checkHealth = async () => {
    setLoading(true);
    const start = performance.now();

    try {
      // DB connectivity + latency check
      const { error: pingError } = await supabase.from("employees").select("id").limit(1);
      const latencyMs = Math.round(performance.now() - start);
      const dbConnected = !pingError;

      // Table row counts (parallel)
      const tableDefs = [
        { name: "orders", label: t("订单", "Orders") },
        { name: "members", label: t("会员", "Members") },
        { name: "employees", label: t("员工", "Employees") },
        { name: "activity_gifts", label: t("活动赠送", "Activity Gifts") },
        { name: "operation_logs", label: t("操作日志", "Operation Logs") },
        { name: "notifications", label: t("通知", "Notifications") },
      ];

      const countResults = await Promise.all(
        tableDefs.map(async (td) => {
          const { count } = await supabase.from(td.name as any).select("*", { count: "exact", head: true });
          return { ...td, count: count || 0 };
        })
      );

      // Recent error count (last 24h)
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      const { count: errorCount } = await supabase
        .from("error_reports")
        .select("*", { count: "exact", head: true })
        .gte("created_at", yesterday);

      // Web Vitals (last 24h averages)
      let webVitals: WebVitalStat[] = [];
      try {
        const { data: vitalsData } = await supabase
          .from("web_vitals")
          .select("metric_name, metric_value, rating")
          .gte("created_at", yesterday);
        
        if (vitalsData && vitalsData.length > 0) {
          const grouped = new Map<string, { values: number[]; good: number; total: number }>();
          for (const row of vitalsData) {
            const g = grouped.get(row.metric_name) || { values: [], good: 0, total: 0 };
            g.values.push(Number(row.metric_value));
            g.total++;
            if (row.rating === 'good') g.good++;
            grouped.set(row.metric_name, g);
          }
          webVitals = Array.from(grouped.entries()).map(([name, g]) => {
            const sorted = g.values.sort((a, b) => a - b);
            const p75Index = Math.floor(sorted.length * 0.75);
            return {
              metric_name: name,
              avg_value: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
              p75_value: Math.round(sorted[p75Index] || 0),
              good_count: g.good,
              total_count: g.total,
            };
          });
        }
      } catch (e) {
        console.warn('Failed to fetch web vitals:', e);
      }

      setHealth({
        dbConnected,
        latencyMs,
        tables: countResults,
        recentErrors: errorCount || 0,
        lastChecked: new Date(),
        webVitals,
      });
    } catch (err) {
      setHealth({
        dbConnected: false,
        latencyMs: -1,
        tables: [],
        recentErrors: -1,
        lastChecked: new Date(),
        webVitals: [],
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { checkHealth(); }, []);

  const getLatencyStatus = (ms: number) => {
    if (ms < 200) return { color: "text-success", label: t("优秀", "Excellent"), icon: CheckCircle2 };
    if (ms < 500) return { color: "text-yellow-500", label: t("正常", "Normal"), icon: AlertTriangle };
    return { color: "text-destructive", label: t("较慢", "Slow"), icon: XCircle };
  };

  return (
    <div className="space-y-4">
      {/* Status Overview */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              {t("系统健康状态", "System Health")}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={checkHealth} disabled={loading} className="h-7 gap-1 text-xs">
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              {t("刷新", "Refresh")}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && !health ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : health ? (
            <div className="space-y-4">
              {/* Connection & Latency */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                  {health.dbConnected ? (
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive shrink-0" />
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">{t("数据库连接", "Database")}</p>
                    <p className="text-sm font-semibold">
                      {health.dbConnected ? t("已连接", "Connected") : t("断开", "Disconnected")}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                  {(() => {
                    const status = getLatencyStatus(health.latencyMs);
                    const Icon = status.icon;
                    return <Icon className={`h-5 w-5 ${status.color} shrink-0`} />;
                  })()}
                  <div>
                    <p className="text-xs text-muted-foreground">{t("响应延迟", "Latency")}</p>
                    <p className="text-sm font-semibold tabular-nums">
                      {health.latencyMs >= 0 ? `${health.latencyMs}ms` : "N/A"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                  {health.recentErrors === 0 ? (
                    <CheckCircle2 className="h-5 w-5 text-success shrink-0" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-yellow-500 shrink-0" />
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">{t("24h错误", "24h Errors")}</p>
                    <p className="text-sm font-semibold tabular-nums">{health.recentErrors >= 0 ? health.recentErrors : "N/A"}</p>
                  </div>
                </div>
              </div>

              {/* Table Stats */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <Database className="h-3 w-3" />
                  {t("数据表统计", "Table Statistics")}
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {health.tables.map((table) => (
                    <div key={table.name} className="flex items-center justify-between p-2 rounded-md border bg-muted/30 text-sm">
                      <span className="text-muted-foreground truncate">{table.label}</span>
                      <Badge variant="secondary" className="text-[10px] tabular-nums ml-2">
                        {table.count.toLocaleString()}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>

              {/* Web Vitals */}
              {health.webVitals.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                    <Gauge className="h-3 w-3" />
                    {t("Core Web Vitals (24h)", "Core Web Vitals (24h)")}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {health.webVitals.map((vital) => {
                      const goodRate = vital.total_count > 0 ? Math.round((vital.good_count / vital.total_count) * 100) : 0;
                      const unit = vital.metric_name === 'CLS' ? '' : 'ms';
                      return (
                        <div key={vital.metric_name} className="p-2 rounded-md border bg-muted/30">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium">{vital.metric_name}</span>
                            <Badge variant={goodRate >= 75 ? "default" : "secondary"} className="text-[10px]">
                              {goodRate}% {t("良好", "good")}
                            </Badge>
                          </div>
                          <div className="text-sm font-semibold tabular-nums">
                            P75: {vital.p75_value}{unit}
                          </div>
                          <div className="text-[10px] text-muted-foreground tabular-nums">
                            {t("平均", "Avg")}: {vital.avg_value}{unit} · {vital.total_count} {t("样本", "samples")}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Last Checked */}
              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {t("最后检查", "Last checked")}: {health.lastChecked.toLocaleTimeString()}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
