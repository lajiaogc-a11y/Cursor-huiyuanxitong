import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AlertTriangle, ChevronDown, Trash2, RefreshCw, ExternalLink, Lightbulb, Code } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { classifyError, getSeverityColor, type ErrorSeverity } from "@/lib/errorClassifier";

interface ErrorReport {
  id: string;
  error_id?: string | null;
  created_at: string;
  error_message: string;
  error_stack: string | null;
  component_stack: string | null;
  url: string | null;
  user_agent: string | null;
  employee_id: string | null;
}

export default function ErrorReportsPanel() {
  const { t, language } = useLanguage();
  const [reports, setReports] = useState<ErrorReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  const fetchReports = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("error_reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      setReports(data || []);
    } catch (err) {
      console.error("Failed to fetch error reports:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports();
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
    const { error } = await supabase.from("error_reports").delete().eq("id", id);
    if (error) {
      toast.error(t("删除失败", "Delete failed"));
    } else {
      setReports((prev) => prev.filter((r) => r.id !== id));
      toast.success(t("已删除", "Deleted"));
    }
  };

  const handleDeleteAll = async () => {
    if (reports.length === 0) return;
    const ids = reports.map((r) => r.id);
    const { error } = await supabase.from("error_reports").delete().in("id", ids);
    if (error) {
      toast.error(t("批量删除失败", "Batch delete failed"));
    } else {
      setReports([]);
      toast.success(t("全部清除", "All cleared"));
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
      {/* Header actions */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-muted-foreground">
          {t(`共 ${reports.length} 条异常报告`, `${reports.length} error reports total`)}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchReports}>
            <RefreshCw className="h-4 w-4 mr-1" />
            {t("刷新", "Refresh")}
          </Button>
          {reports.length > 0 && (
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
            {t("暂无异常报告", "No error reports")}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((report) => {
            const cls = report.classification;
            const sev = getSeverityColor(cls.severity);
            const isOpen = expandedIds.has(report.id);

            return (
              <Card key={report.id} className="overflow-hidden">
                <Collapsible open={isOpen} onOpenChange={() => toggleExpand(report.id)}>
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
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(report.created_at), "yyyy-MM-dd HH:mm:ss")}
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
                      <p className={`text-sm font-medium ${sev.text}`}>{cls.summary[lang]}</p>
                      <p className="text-xs text-muted-foreground truncate">{truncateUA(report.user_agent)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); handleDelete(report.id); }}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7">
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
                          {report.error_message}
                        </pre>
                      </div>

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
    </div>
  );
}
