import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Activity, RefreshCw, Trash2, TrendingUp, AlertTriangle, Pause } from "lucide-react";
import { getPerformanceReport, clearPerformanceMetrics, getRemainingPauseTime } from "@/lib/performanceUtils";
import { useLanguage } from "@/contexts/LanguageContext";
import { notify } from "@/lib/notifyHub";

interface RenderMetrics {
  componentName: string;
  renderCount: number;
  lastRenderTime: number;
  avgRenderTime: number;
  totalRenderTime: number;
  unnecessaryRenders: number;
}

export default function PerformanceDashboard() {
  const [metrics, setMetrics] = useState<RenderMetrics[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const { t } = useLanguage();

  const refreshMetrics = () => {
    // Check if tracking is paused
    const remainingPause = getRemainingPauseTime();
    if (remainingPause > 0) {
      setIsPaused(true);
    } else {
      setIsPaused(false);
      setMetrics(getPerformanceReport());
    }
  };

  const resumeTimerRef = useRef<NodeJS.Timeout>();

  const handleClear = () => {
    clearPerformanceMetrics();
    setMetrics([]);
    setIsPaused(true);
    notify.success(t("数据已清除，监控暂停5秒", "Data cleared, monitoring paused for 5s"));
    
    clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      setIsPaused(false);
    }, 5000);
  };

  useEffect(() => {
    if (isOpen) {
      refreshMetrics();
      const interval = setInterval(refreshMetrics, 2000);
      return () => {
        clearInterval(interval);
        clearTimeout(resumeTimerRef.current);
      };
    }
  }, [isOpen]);

  const getWastePercentage = (m: RenderMetrics) => {
    if (m.renderCount === 0) return 0;
    return (m.unnecessaryRenders / m.renderCount) * 100;
  };

  const getHealthBadge = (wastePercent: number) => {
    if (wastePercent < 10) {
      return <Badge className="bg-green-100 text-green-700 border-green-200">{t("健康", "Healthy")}</Badge>;
    } else if (wastePercent < 30) {
      return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">{t("一般", "Fair")}</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-700 border-red-200">{t("需优化", "Needs Optimization")}</Badge>;
    }
  };

  const totalRenders = metrics.reduce((sum, m) => sum + m.renderCount, 0);
  const totalUnnecessary = metrics.reduce((sum, m) => sum + m.unnecessaryRenders, 0);
  const overallWaste = totalRenders > 0 ? (totalUnnecessary / totalRenders) * 100 : 0;

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        title={t("性能监控", "Performance Monitor")}
        onClick={() => setIsOpen(true)}
      >
        <Activity className="h-4 w-4" />
      </Button>
      <DrawerDetail
        open={isOpen}
        onOpenChange={setIsOpen}
        title={
          <span className="flex items-center gap-2 flex-wrap">
            <Activity className="h-5 w-5 text-primary shrink-0" />
            {t("性能监控面板", "Performance Monitor")}
            {isPaused && (
              <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                <Pause className="h-3 w-3 mr-1" />
                {t("监控已暂停", "Paused")}
              </Badge>
            )}
          </span>
        }
        sheetMaxWidth="4xl"
      >
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground mb-1">{t("跟踪组件", "Tracked Components")}</div>
                <div className="text-2xl font-bold text-primary">{metrics.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground mb-1">{t("总渲染次数", "Total Renders")}</div>
                <div className="text-2xl font-bold">{totalRenders}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground mb-1">{t("冗余渲染", "Redundant Renders")}</div>
                <div className="text-2xl font-bold text-orange-600">{totalUnnecessary}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-xs text-muted-foreground mb-1">{t("总体浪费率", "Waste Rate")}</div>
                <div className="flex items-center gap-2">
                  <span className={`text-2xl font-bold ${overallWaste > 30 ? 'text-red-600' : overallWaste > 10 ? 'text-yellow-600' : 'text-green-600'}`}>
                    {overallWaste.toFixed(1)}%
                  </span>
                  {overallWaste > 30 && <AlertTriangle className="h-4 w-4 text-red-500" />}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Overall Health Bar */}
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{t("性能健康度", "Performance Health")}</span>
                <span className="text-sm text-muted-foreground">{(100 - overallWaste).toFixed(1)}%</span>
              </div>
              <Progress 
                value={Math.max(0, 100 - overallWaste)} 
                className="h-2"
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refreshMetrics}>
              <RefreshCw className="h-4 w-4 mr-1" />
              {t("刷新数据", "Refresh")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setClearConfirmOpen(true)}>
              <Trash2 className="h-4 w-4 mr-1" />
              {t("清除数据", "Clear")}
            </Button>
          </div>

          {/* Metrics Table */}
          {metrics.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>{t("组件名称", "Component")}</TableHead>
                    <TableHead className="text-center">{t("总渲染", "Renders")}</TableHead>
                    <TableHead className="text-center">{t("冗余渲染", "Redundant")}</TableHead>
                    <TableHead className="text-center">{t("浪费率", "Waste")}</TableHead>
                    <TableHead className="text-center">{t("状态", "Status")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metrics.map((m) => {
                    const wastePercent = getWastePercentage(m);
                    return (
                      <TableRow key={m.componentName}>
                        <TableCell className="font-mono text-sm">{m.componentName}</TableCell>
                        <TableCell className="text-center">{m.renderCount}</TableCell>
                        <TableCell className="text-center">
                          <span className={m.unnecessaryRenders > 0 ? 'text-orange-600 font-medium' : ''}>
                            {m.unnecessaryRenders}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Progress 
                              value={wastePercent} 
                              className="h-1.5 w-16"
                            />
                            <span className="text-xs w-12">{wastePercent.toFixed(1)}%</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {getHealthBadge(wastePercent)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t("暂无性能数据", "No performance data")}</p>
              <p className="text-xs mt-1">{t("在应用中操作后，这里将显示组件渲染统计", "Component render stats will appear after interacting with the app")}</p>
            </div>
          )}

          {/* Tips */}
          <Card className="bg-muted/30">
            <CardContent className="pt-4 text-sm">
              <div className="font-medium mb-2">💡 {t("优化提示", "Optimization Tips")}</div>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>{t("冗余渲染指100ms内的重复渲染，可能表示状态更新过于频繁", "Redundant renders are re-renders within 100ms, possibly indicating frequent state updates")}</li>
                <li>{t("浪费率超过30%的组件需要关注优化", "Components with >30% waste rate need optimization attention")}</li>
                <li>{t("使用", "Use")} <code className="bg-muted px-1 rounded">React.memo</code> {t("或优化依赖项可减少不必要渲染", "or optimize dependencies to reduce unnecessary renders")}</li>
                <li>{t("在控制台运行", "Run")} <code className="bg-muted px-1 rounded">__perfMonitor.logSummary()</code> {t("查看详细报告", "in console to view detailed report")}</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </DrawerDetail>

      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("清除性能监控数据？", "Clear performance metrics?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "将清空当前会话内收集的组件渲染统计，并短暂暂停采集。本操作仅影响本机调试数据。",
                "Clears in-memory render stats for this session and pauses collection briefly. This only affects local dev diagnostics.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setClearConfirmOpen(false);
                handleClear();
              }}
            >
              {t("清除", "Clear")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
