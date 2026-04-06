import { useCallback, useMemo, useState } from "react";
import { Trash2, Sparkles, Loader2, Save, Play, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { listCleanupModules } from "@/dataCleanup/cleanupModuleRegistry";
import { runCleanupModules } from "@/dataCleanup/cleanupExecutor";
import type { CleanupRunSummary } from "@/dataCleanup/types";
import {
  deleteTemplate,
  listTemplates,
  resolveTemplateModuleIds,
  saveTemplate,
  type CleanupTemplate,
} from "@/dataCleanup/templateManager";

type TFn = (zh: string, en: string) => string;

function buildDefaultSelection(): Record<string, boolean> {
  const next: Record<string, boolean> = {};
  for (const m of listCleanupModules()) {
    next[m.id] = Boolean(m.participatesInFullClear && m.allowDelete && m.defaultChecked);
  }
  return next;
}

export function DataCleanupCenterPanel({
  t,
  canBulkDeleteBusinessData,
  onRequestFullBulkClear,
  onOpenBulkDeleteDialog,
}: {
  t: TFn;
  canBulkDeleteBusinessData: boolean;
  /** 将批量删除勾选设为全量预设并打开密码对话框 */
  onRequestFullBulkClear: () => void;
  onOpenBulkDeleteDialog: () => void;
}) {
  const modules = useMemo(() => listCleanupModules(), []);
  const [selected, setSelected] = useState<Record<string, boolean>>(buildDefaultSelection);
  const [fullClearOpen, setFullClearOpen] = useState(false);
  const [placeholderRunning, setPlaceholderRunning] = useState(false);
  const [lastRun, setLastRun] = useState<CleanupRunSummary | null>(null);
  const [resultOpen, setResultOpen] = useState(false);

  const [templates, setTemplates] = useState<CleanupTemplate[]>(() => listTemplates());
  const [newTemplateName, setNewTemplateName] = useState("");

  const toggle = useCallback((id: string, checked: boolean) => {
    setSelected((s) => ({ ...s, [id]: checked }));
  }, []);

  const handleSaveTemplate = useCallback(() => {
    const includeModuleIds = modules.filter((m) => selected[m.id]).map((m) => m.id);
    const excludeModuleIds = modules.filter((m) => !selected[m.id]).map((m) => m.id);
    const row = saveTemplate({
      name: newTemplateName.trim() || t("未命名模板", "Untitled template"),
      includeModuleIds,
      excludeModuleIds,
    });
    setNewTemplateName("");
    setTemplates(listTemplates());
    void row;
  }, [modules, newTemplateName, selected, t]);

  const handleApplyTemplate = useCallback(
    (tpl: CleanupTemplate) => {
      const ids = new Set(resolveTemplateModuleIds(tpl));
      const next: Record<string, boolean> = {};
      for (const m of modules) {
        next[m.id] = ids.has(m.id);
      }
      setSelected(next);
    },
    [modules],
  );

  const handleDeleteTemplate = useCallback((id: string) => {
    deleteTemplate(id);
    setTemplates(listTemplates());
  }, []);

  const runPlaceholderCleanup = useCallback(async () => {
    const ids = modules.filter((m) => selected[m.id] && m.execute).map((m) => m.id);
    if (ids.length === 0) return;
    setPlaceholderRunning(true);
    try {
      const summary = await runCleanupModules(ids);
      setLastRun(summary);
      setResultOpen(true);
    } finally {
      setPlaceholderRunning(false);
    }
  }, [modules, selected]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-5 w-5 text-primary" />
            {t("模块化数据清理中心", "Modular data cleanup center")}
          </CardTitle>
          <CardDescription>
            {t(
              "模块列表由左侧导航注册表自动生成；「数据管理」默认不参与一键全清。实际数据库清理请使用批量删除对话框（需管理员密码）。占位清理用于预览执行流。",
              "Modules are driven by the navigation registry. “Data management” is excluded from one-click full clear by default. Database purge uses the bulk-delete dialog (admin password). Placeholder runs preview the executor pipeline.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              className="gap-2"
              disabled={!canBulkDeleteBusinessData}
              onClick={() => setFullClearOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              {t("一键清除全部数据", "One-click clear all data")}
            </Button>
            <Button type="button" variant="outline" className="gap-2" onClick={onOpenBulkDeleteDialog}>
              {t("打开批量删除对话框", "Open bulk delete dialog")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="gap-2"
              disabled={placeholderRunning}
              onClick={() => void runPlaceholderCleanup()}
            >
              {placeholderRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              {t("执行所选模块（占位）", "Run selected (placeholder)")}
            </Button>
          </div>

          <ScrollArea className="h-[min(420px,50vh)] rounded-md border p-3">
            <ul className="space-y-3 pr-2">
              {modules.map((m) => {
                const lang = t(m.labelZh, m.labelEn);
                const disabled = !m.allowDelete;
                const checked = Boolean(selected[m.id]);
                return (
                  <li key={m.id} className="flex gap-2 text-sm">
                    <Checkbox
                      id={`cleanup-mod-${m.id}`}
                      checked={checked}
                      disabled={disabled}
                      onCheckedChange={(c) => !disabled && toggle(m.id, c === true)}
                    />
                    <div className="min-w-0 flex-1">
                      <Label htmlFor={`cleanup-mod-${m.id}`} className={disabled ? "text-muted-foreground" : ""}>
                        {lang}
                        {m.isPlaceholder ? (
                          <span className="ml-2 text-xs text-muted-foreground">({t("占位", "placeholder")})</span>
                        ) : null}
                      </Label>
                      {m.isReservedData && m.reservedReasonZh ? (
                        <p className="text-xs text-muted-foreground">{t(m.reservedReasonZh, m.reservedReasonEn ?? "")}</p>
                      ) : null}
                      {disabled && !m.isReservedData ? (
                        <p className="text-xs text-amber-600 dark:text-amber-500">
                          {t("不可删除或未授权", "Not allowed")}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Save className="h-4 w-4" />
            {t("清理模板", "Cleanup templates")}
          </CardTitle>
          <CardDescription>
            {t("保存在本机浏览器。新导航模块会自动出现在列表中；模板中的未知 id 会被忽略。", "Stored in this browser. New nav modules appear automatically; unknown ids in templates are ignored.")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">{t("模板名称", "Template name")}</Label>
              <Input
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder={t("例如：全量除数据管理", "e.g. Full except data mgmt")}
                className="w-[min(100%,280px)]"
              />
            </div>
            <Button type="button" variant="secondary" className="gap-1" onClick={handleSaveTemplate}>
              <Save className="h-4 w-4" />
              {t("保存当前勾选为模板", "Save selection as template")}
            </Button>
          </div>
          <ul className="space-y-2 text-sm">
            {templates.length === 0 ? (
              <li className="text-muted-foreground">{t("暂无模板", "No templates yet")}</li>
            ) : (
              templates.map((tpl) => (
                <li
                  key={tpl.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2"
                >
                  <span className="font-medium">{tpl.name}</span>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => handleApplyTemplate(tpl)}>
                      {t("应用勾选", "Apply selection")}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => handleDeleteTemplate(tpl.id)}>
                      {t("删除", "Delete")}
                    </Button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>

      <AlertDialog open={fullClearOpen} onOpenChange={setFullClearOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              {t("确认一键清除？", "Confirm one-click clear?")}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2 text-left">
              <p>
                {t(
                  "将打开「批量删除」对话框并载入全量预设勾选（与原有「全选」一致）。不包含「数据管理」模块语义上的保留项；仍需输入管理员密码。",
                  "This opens the bulk-delete dialog with the full preset (same as Select All). Data-management protection applies; admin password is still required.",
                )}
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={!canBulkDeleteBusinessData}
              onClick={() => {
                setFullClearOpen(false);
                onRequestFullBulkClear();
              }}
            >
              {t("继续", "Continue")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resultOpen} onOpenChange={setResultOpen}>
        <AlertDialogContent className="max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("占位清理结果", "Placeholder cleanup result")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-sm text-foreground">
                {lastRun ? (
                  <>
                    <div>
                      <span className="font-medium">{t("成功", "Success")}:</span> {lastRun.success.length}
                    </div>
                    <div>
                      <span className="font-medium">{t("跳过", "Skipped")}:</span> {lastRun.skipped.length}
                    </div>
                    <div>
                      <span className="font-medium">{t("失败", "Failed")}:</span> {lastRun.failed.length}
                    </div>
                    <ScrollArea className="h-40 rounded border p-2 text-xs">
                      {[...lastRun.success, ...lastRun.skipped, ...lastRun.failed].map((r) => (
                        <div key={`${r.moduleId}-${r.status}`} className="mb-1">
                          <span className="font-mono">{r.moduleId}</span> — {r.status}
                          {r.message ? `: ${r.message}` : ""}
                        </div>
                      ))}
                    </ScrollArea>
                  </>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("关闭", "Close")}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
