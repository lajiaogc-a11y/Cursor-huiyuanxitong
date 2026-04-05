import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, BarChart3, FileText, Layers, TrendingUp } from "lucide-react";
import { AuditLogEntry, MODULE_NAMES, ModuleType } from "@/stores/auditLogStore";
import { useLanguage } from "@/contexts/LanguageContext";

interface ModuleCoverageDashboardProps {
  logs: AuditLogEntry[];
  serverModuleCounts?: Record<string, number>;
  totalCount?: number;
}

export function ModuleCoverageDashboard({ logs, serverModuleCounts, totalCount }: ModuleCoverageDashboardProps) {
  const { t, language } = useLanguage();
  const [showInactive, setShowInactive] = useState(false);

  const moduleStats = useMemo(() => {
    if (serverModuleCounts && Object.keys(serverModuleCounts).length > 0) return serverModuleCounts;
    const stats: Record<string, number> = {};
    logs.forEach(log => {
      stats[log.module] = (stats[log.module] || 0) + 1;
    });
    return stats;
  }, [logs, serverModuleCounts]);

  const effectiveTotal = totalCount ?? logs.length;

  const allModules = Object.keys(MODULE_NAMES) as ModuleType[];
  const totalModules = allModules.length;
  const activeModules = allModules.filter(m => (moduleStats[m] || 0) > 0);
  const inactiveModules = allModules.filter(m => (moduleStats[m] || 0) === 0);
  const activePercentage = totalModules > 0 ? Math.round((activeModules.length / totalModules) * 100) : 0;
  const maxCount = Math.max(...Object.values(moduleStats), 1);

  const getModuleDisplayName = (module: ModuleType): string => {
    const names = MODULE_NAMES[module];
    return names ? (language === 'zh' ? names.zh : names.en) : module;
  };

  const sortedActiveModules = useMemo(() => {
    return [...activeModules].sort((a, b) => (moduleStats[b] || 0) - (moduleStats[a] || 0));
  }, [activeModules, moduleStats]);

  if (effectiveTotal === 0 && logs.length === 0) {
    return null;
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          {t("模块日志统计", "Module Log Statistics")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* 统计卡片 - 更清晰的视觉层次 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border bg-muted/30 px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-0.5">
              <FileText className="h-3.5 w-3.5" />
              <span className="text-xs">{t("总日志", "Total Logs")}</span>
            </div>
            <div className="text-xl font-semibold tabular-nums">{effectiveTotal.toLocaleString()}</div>
          </div>
          <div className="rounded-lg border bg-muted/30 px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-0.5">
              <Layers className="h-3.5 w-3.5" />
              <span className="text-xs">{t("活跃模块", "Active Modules")}</span>
            </div>
            <div className="text-xl font-semibold tabular-nums">
              {activeModules.length}<span className="text-sm font-normal text-muted-foreground">/{totalModules}</span>
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 px-4 py-3 text-center">
            <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-0.5">
              <TrendingUp className="h-3.5 w-3.5" />
              <span className="text-xs">{t("活跃率", "Active Rate")}</span>
            </div>
            <div className="text-xl font-semibold tabular-nums">{activePercentage}%</div>
          </div>
        </div>

        {/* 简洁说明 - 去掉突兀的进度条 */}
        <p className="text-xs text-muted-foreground">
          {t(
            `共 ${totalModules} 个模块已接入日志系统，以下为各模块操作记录分布`,
            `All ${totalModules} modules are integrated. Operation counts by module:`
          )}
        </p>

        {/* 活跃模块 - 带迷你条形图 */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {t("有记录的模块", "Modules with activity")}
          </div>
          <div className="space-y-2">
            {sortedActiveModules.map((module) => {
              const count = moduleStats[module] || 0;
              const pct = effectiveTotal > 0 ? (count / effectiveTotal) * 100 : 0;
              const barWidth = (count / maxCount) * 100;

              return (
                <div
                  key={module}
                  className="flex items-center gap-3 py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors"
                >
                  <span className="flex-1 min-w-0 truncate text-sm">{getModuleDisplayName(module)}</span>
                  <div className="flex items-center gap-3 w-40 shrink-0">
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden min-w-[60px]">
                      <div
                        className="h-full bg-primary/70 rounded-full transition-all"
                        style={{ width: `${Math.max(barWidth, 4)}%` }}
                      />
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground w-12 text-right">
                      {count} ({pct.toFixed(1)}%)
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 无记录模块 - 可折叠，减少视觉噪音 */}
        {inactiveModules.length > 0 && (
          <div className="border-t pt-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground hover:text-foreground -ml-1"
              onClick={() => setShowInactive(!showInactive)}
              aria-expanded={showInactive}
            >
              {showInactive ? (
                <ChevronUp className="h-4 w-4 mr-1" />
              ) : (
                <ChevronDown className="h-4 w-4 mr-1" />
              )}
              {t("无记录模块", "No activity")} ({inactiveModules.length})
            </Button>
            {showInactive && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {inactiveModules.map((module) => (
                  <Badge
                    key={module}
                    variant="secondary"
                    className="text-xs font-normal text-muted-foreground py-0.5"
                  >
                    {getModuleDisplayName(module)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
