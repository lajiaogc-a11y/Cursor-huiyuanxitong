import { useState, useEffect, useMemo } from "react";
import {
  listErrorReports,
  deleteErrorReport,
  deleteErrorReportsByIds,
  type ErrorReportRow,
} from "@/services/observability/errorReportService";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AlertTriangle, ChevronDown, Trash2, RefreshCw, ExternalLink, Lightbulb, Code, Info } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { notify } from "@/lib/notifyHub";
import { classifyError, getSeverityColor } from "@/lib/errorClassifier";
import { formatBeijingTime } from "@/lib/beijingTime";
import { useFieldPermissions } from "@/hooks/staff/useFieldPermissions";

function headlineFromErrorMessage(msg: string, maxLen = 220): string {
  const trimmed = (msg || "").trim();
  if (!trimmed) return "";
  const firstLine = trimmed.split(/\r?\n/).find((l) => l.trim().length > 0) ?? trimmed;
  const line = firstLine.trim();
  return line.length > maxLen ? `${line.slice(0, maxLen)}…` : line;
}

export default function ErrorReportsPanel() {
  const { t, language } = useLanguage();
  const { checkPermission } = useFieldPermissions();
  const canDeleteReports = useMemo(() => {
    const single = checkPermission("error_reports", "delete_report");
    const batch = checkPermission("error_reports", "batch_clear");
    return single.canDelete || batch.canDelete;
  }, [checkPermission]);
  const [reports, setReports] = useState<ErrorReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [deleteReportId, setDeleteReportId] = useState<string | null>(null);

  const fetchReports = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      setReports(await listErrorReports(100));
    } catch (err) {
      console.error("Failed to fetch error reports:", err);
      const msg =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : t("加载失败", "Failed to load");
      setFetchError(msg);
      notify.error(t("异常报告加载失败", "Failed to load error reports"), { description: msg });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Classify all reports
  const classifiedReports = useMemo(() => {
    return reports.map(r => ({ ...r, classification: classifyError(r.error_message) }));
  }, [reports]);

  // Severity counts
  const counts = useMemo(() => {
    const c = { critical: 0, warning: 0, info: 0 };
    classifiedReports.forEach(r => c[r.classification.severity]++);
    return c;
  }, [classifiedReports]);

  // Filtered
  const filtered = useMemo(() => {
    if (severityFilter === "all") return classifiedReports;
    return classifiedReports.filter(r => r.classification.severity === severityFilter);
  }, [classifiedReports, severityFilter]);

  const handleDelete = async (id: string) => {
    try {
      await deleteErrorReport(id);
      setReports((prev) => prev.filter((r) => r.id !== id));
      notify.success(t("已删除", "Deleted"));
    } catch {
      notify.error(t("删除失败", "Delete failed"));
    }
  };

  const handleDeleteAll = async () => {
    if (reports.length === 0) return;
    const ids = reports.map((r) => r.id);
    try {
      await deleteErrorReportsByIds(ids);
      setReports([]);
      notify.success(t("全部清除", "All cleared"));
    } catch {
      notify.error(t("批量删除失败", "Batch delete failed"));
    }
  };

  const truncateUA = (ua: string | null) => {
    if (!ua) return "-";
    return ua.length > 60 ? ua.slice(0, 60) + "…" : ua;
  };

  const lang = language as 'zh' | 'en';

  if (loading) {
    return (
      <div className="space-y-3 p-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Alert variant="default" className="border-primary/30 bg-primary/5">
        <Info className="h-4 w-4" />
        <AlertTitle>{t("这些异常是什么？", "What are these reports?")}</AlertTitle>
        <AlertDescription className="text-xs leading-relaxed space-y-1">
          <p>
            {t(
              "数据来自员工登录后台时，浏览器自动上报的前端错误（页面脚本、未处理的 Promise 等），按租户存储。多数情况下是网络波动、浏览器扩展、发版后旧缓存、或个别页面边界情况，并不等同于「整站服务器宕机」。",
              "These are frontend errors auto-captured while staff use the admin app (JS errors, unhandled rejections), stored per tenant. Many are network blips, browser extensions, stale cache after deploy, or edge UI cases—not necessarily a full server outage.",
            )}
          </p>
          <p className="text-muted-foreground">
            {t(
              "已自动过滤常见无害项（如 ResizeObserver、扩展脚本、资源分块加载失败等）；同一错误在约 5 分钟内只会上报一次，减少重复条数。列表最多显示最近 100 条。仍显示的记录建议结合「页面 URL」与堆栈排查对应模块。",
              "Benign noise (e.g. ResizeObserver, extension scripts, chunk load failures) is filtered before upload. The same error fingerprint is only sent once per ~5 minutes to reduce duplicates. The list shows up to the 100 most recent rows. For remaining entries, use the URL and stack to trace the feature.",
            )}
          </p>
        </AlertDescription>
      </Alert>

      {/* Header actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-muted-foreground">
          {fetchError
            ? t("加载失败，请点刷新重试", "Load failed — tap refresh to retry")
            : t(`共 ${reports.length} 条异常报告`, `${reports.length} error reports total`)}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchReports}>
            <RefreshCw className="h-4 w-4 mr-1" />
            {t("刷新", "Refresh")}
          </Button>
          {reports.length > 0 && canDeleteReports && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-1" />
                  {t("清除全部", "Clear All")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("确认清除全部异常报告？", "Clear all error reports?")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t(`将删除全部 ${reports.length} 条异常报告，此操作不可撤销。`, `This will delete all ${reports.length} error reports. This action cannot be undone.`)}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteAll} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    {t("确认清除", "Confirm Clear")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* Severity filter */}
      {reports.length > 0 && (
        <ToggleGroup type="single" value={severityFilter} onValueChange={(v) => v && setSeverityFilter(v)} size="sm" variant="outline" className="justify-start flex-wrap">
          <ToggleGroupItem value="all" className="text-xs gap-1">
            {t("全部", "All")} <Badge variant="secondary" className="text-[10px] px-1 py-0">{reports.length}</Badge>
          </ToggleGroupItem>
          <ToggleGroupItem value="critical" className="text-xs gap-1">
            🔴 {t("严重", "Critical")} <Badge variant="destructive" className="text-[10px] px-1 py-0">{counts.critical}</Badge>
          </ToggleGroupItem>
          <ToggleGroupItem value="warning" className="text-xs gap-1">
            🟡 {t("警告", "Warning")} <Badge variant="warning" className="text-[10px] px-1 py-0">{counts.warning}</Badge>
          </ToggleGroupItem>
          <ToggleGroupItem value="info" className="text-xs gap-1">
            🔵 {t("信息", "Info")} <Badge variant="secondary" className="text-[10px] px-1 py-0">{counts.info}</Badge>
          </ToggleGroupItem>
        </ToggleGroup>
      )}

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
            {fetchError
              ? t("无法拉取异常报告列表", "Could not load error reports")
              : reports.length > 0 && severityFilter !== "all"
                ? t("当前筛选下没有记录，请换一类或选「全部」", "No reports match this filter — try another severity or “All”.")
                : t("暂无异常报告", "No error reports")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((report) => {
            const cls = report.classification;
            const sev = getSeverityColor(cls.severity);
            const isOpen = expandedIds.has(report.id);

            const rawHeadline = headlineFromErrorMessage(report.error_message);
            const titleText =
              rawHeadline || cls.summary[lang] || t("(无错误文案)", "(No error message)");

            return (
              <Card key={report.id} className="overflow-hidden">
                <Collapsible
                  open={isOpen}
                  onOpenChange={(open) => {
                    setExpandedIds((prev) => {
                      const next = new Set(prev);
                      if (open) next.add(report.id);
                      else next.delete(report.id);
                      return next;
                    });
                  }}
                >
                  <div className="flex items-start gap-3 p-3">
                    <span className="shrink-0 mt-0.5 text-sm">{sev.dot}</span>
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant={cls.severity === 'critical' ? 'destructive' : cls.severity === 'warning' ? 'warning' : 'secondary'} className="text-[10px]">
                          {cls.severity === 'critical' ? t('严重', 'Critical') : cls.severity === 'warning' ? t('警告', 'Warning') : t('信息', 'Info')}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {cls.category[lang]}
                        </Badge>
                        <span className="text-xs text-muted-foreground font-mono tabular-nums">
                          {report.created_at ? formatBeijingTime(report.created_at) : "—"}
                        </span>
                        {report.error_id && (
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {report.error_id}
                          </Badge>
                        )}
                        {report.url && (
                          <span className="text-xs text-muted-foreground flex items-center gap-0.5 truncate max-w-[200px]">
                            <ExternalLink className="h-3 w-3 shrink-0" />
                            {report.url}
                          </span>
                        )}
                      </div>
                      <p className={`text-sm font-medium break-words ${sev.text}`} title={report.error_message}>
                        {titleText}
                      </p>
                      {rawHeadline ? (
                        <p className="text-xs text-muted-foreground">
                          {t("归类说明", "Summary")}: {cls.summary[lang]}
                        </p>
                      ) : null}
                      <p className="text-xs text-muted-foreground truncate">{truncateUA(report.user_agent)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {canDeleteReports ? (
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Delete" onClick={(e) => { e.stopPropagation(); setDeleteReportId(report.id); }}>
                          <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        </Button>
                      ) : null}
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Expand">
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </div>
                  <CollapsibleContent>
                    <div className="border-t px-3 py-2 space-y-3 bg-muted/30">
                      {/* Fix suggestion */}
                      <div className={`rounded-md p-3 ${sev.bg} border ${sev.border}`}>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Lightbulb className="h-3.5 w-3.5 text-primary" />
                          <span className="text-xs font-medium">{t("建议操作", "Suggested Action")}</span>
                        </div>
                        <p className="text-xs text-foreground/80">{cls.suggestion[lang]}</p>
                      </div>

                      {/* Original error message */}
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <Code className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium">{t("原始错误信息", "Original Error Message")}</span>
                        </div>
                        <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-all bg-muted p-2 rounded max-h-24 overflow-y-auto">
                          {report.error_message || "—"}
                        </pre>
                      </div>

                      {report.metadata && Object.keys(report.metadata).length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1">{t("上报上下文", "Report context")}</p>
                          <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-all bg-muted p-2 rounded max-h-32 overflow-y-auto">
                            {JSON.stringify(report.metadata, null, 2)}
                          </pre>
                        </div>
                      )}

                      {report.error_stack && (
                        <div>
                          <p className="text-xs font-medium mb-1">{t("错误堆栈", "Error Stack")}</p>
                          <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-all bg-muted p-2 rounded max-h-40 overflow-y-auto">
                            {report.error_stack}
                          </pre>
                        </div>
                      )}
                      {report.component_stack && (
                        <div>
                          <p className="text-xs font-medium mb-1">{t("组件堆栈", "Component Stack")}</p>
                          <pre className="text-[10px] text-muted-foreground whitespace-pre-wrap break-all bg-muted p-2 rounded max-h-40 overflow-y-auto">
                            {report.component_stack}
                          </pre>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={deleteReportId !== null} onOpenChange={(open) => !open && setDeleteReportId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认删除该条异常报告？", "Delete this error report?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("删除后不可恢复。若需保留排查线索，请先展开复制堆栈或 URL。", "This cannot be undone. Copy the stack or URL first if you still need it.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const id = deleteReportId;
                setDeleteReportId(null);
                if (id) void handleDelete(id);
              }}
            >
              {t("删除", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
