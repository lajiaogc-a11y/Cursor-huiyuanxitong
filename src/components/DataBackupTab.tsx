import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DangerConfirmDialog } from "@/components/ui/danger-confirm-dialog";
import { Database, Download, Loader2, Trash2, RefreshCw, CheckCircle, XCircle, Eye, RotateCcw, FileDown, ShieldAlert, Clock, HardDrive, FlaskConical } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  executeBackup,
  getBackupHistory,
  deleteBackup,
  getBackupSnapshot,
  restoreBackup,
  exportBackupAsJson,
  cleanupWebhookEventQueue,
  formatBytes,
  type BackupRecord,
} from "@/services/dataBackupService";
import { format } from "date-fns";

export default function DataBackupTab() {
  const { t } = useLanguage();
  const { employee } = useAuth();
  const isSuperAdmin = employee?.is_super_admin === true;

  const [history, setHistory] = useState<BackupRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [backing, setBacking] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  // DR Drill state
  const [drillTarget, setDrillTarget] = useState<string | null>(null);
  const [drillRunning, setDrillRunning] = useState(false);
  const [drillReport, setDrillReport] = useState<{
    backup_id: string;
    backup_time: string;
    drill_time: string;
    duration_ms: number;
    tables_checked: number;
    total_backup_rows: number;
    total_current_rows: number;
    details: { table: string; backup_rows: number; current_rows: number; match: boolean }[];
    overall_pass: boolean;
  } | null>(null);

  // View dialog state
  const [viewBackupId, setViewBackupId] = useState<string | null>(null);
  const [viewTable, setViewTable] = useState<string>("orders");
  const [viewData, setViewData] = useState<any[]>([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewBackupTables, setViewBackupTables] = useState<string[]>([]);

  // Restore danger confirm
  const [restoreDangerOpen, setRestoreDangerOpen] = useState(false);

  useEffect(() => {
    if (isSuperAdmin) loadHistory();
    else setLoading(false);
  }, [isSuperAdmin]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await getBackupHistory();
      setHistory(data);
    } catch {
      // silent
    }
    setLoading(false);
  };

  const handleBackup = async () => {
    setBacking(true);
    try {
      const result = await executeBackup('manual', employee?.id, employee?.real_name);
      if (result.status === 'success') {
        const total = Object.values(result.record_counts).reduce((a, b) => a + b, 0);
        toast.success(t(`备份成功，共 ${total} 条记录`, `Backup successful, ${total} records total`));
      } else {
        toast.error(t(`备份失败: ${result.error_message}`, `Backup failed: ${result.error_message}`));
      }
      await loadHistory();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBacking(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBackup(id);
      toast.success(t("备份已删除", "Backup deleted"));
      await loadHistory();
    } catch (e: any) {
      toast.error(e.message);
    }
    setDeleteTarget(null);
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      const result = await restoreBackup(restoreTarget);
      if (result.success) {
        const total = Object.values(result.restored).reduce((a, b) => a + b, 0);
        toast.success(t(`恢复成功，共 ${total} 条记录`, `Restore successful, ${total} records total`));
      } else {
        toast.error(t(`部分恢复失败: ${result.errors.slice(0, 2).join('; ')}`, `Some restores failed: ${result.errors.slice(0, 2).join('; ')}`));
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setRestoring(false);
      setRestoreTarget(null);
      setRestoreDangerOpen(false);
    }
  };

  const handleDownload = async (record: BackupRecord) => {
    setDownloading(record.id);
    try {
      const { data, counts } = await exportBackupAsJson(record.id);
      const exportObj = {
        backup_id: record.id,
        backup_name: record.backup_name,
        backup_time: record.created_at,
        record_counts: counts,
        data,
      };
      const blob = new Blob([JSON.stringify(exportObj, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_${format(new Date(record.created_at), 'yyyyMMdd_HHmmss')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t("下载完成", "Download complete"));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDownloading(null);
    }
  };

  const handleView = async (backupId: string, tables: string[], table?: string) => {
    const targetTable = table || tables[0] || 'orders';
    setViewBackupId(backupId);
    setViewBackupTables(tables);
    setViewTable(targetTable);
    setViewLoading(true);
    try {
      const rows = await getBackupSnapshot(backupId, targetTable);
      setViewData(rows.slice(0, 50));
    } catch (e: any) {
      toast.error(e.message);
      setViewData([]);
    } finally {
      setViewLoading(false);
    }
  };

  const handleCleanWebhook = async () => {
    setCleaning(true);
    try {
      const count = await cleanupWebhookEventQueue();
      toast.success(t(`已清理 ${count} 条过期Webhook记录`, `Cleaned ${count} expired webhook records`));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setCleaning(false);
    }
  };

  // DR Drill: compare backup data against current DB (read-only, no overwrites)
  const handleDrDrill = async (backupId: string) => {
    setDrillRunning(true);
    setDrillTarget(backupId);
    const startTime = Date.now();
    const record = history.find(h => h.id === backupId);
    const details: { table: string; backup_rows: number; current_rows: number; match: boolean }[] = [];

    try {
      const tables = record?.tables_backed_up || [];
      for (const table of tables) {
        try {
          const backupRows = await getBackupSnapshot(backupId, table);
          const { count } = await (await import('@/integrations/supabase/client')).supabase
            .from(table as any)
            .select('id', { count: 'exact', head: true });
          const currentCount = count || 0;
          details.push({
            table,
            backup_rows: backupRows.length,
            current_rows: currentCount,
            match: backupRows.length <= currentCount, // backup should be subset of current
          });
        } catch {
          details.push({ table, backup_rows: 0, current_rows: 0, match: false });
        }
      }

      const duration = Date.now() - startTime;
      setDrillReport({
        backup_id: backupId,
        backup_time: record?.created_at || '',
        drill_time: new Date().toISOString(),
        duration_ms: duration,
        tables_checked: details.length,
        total_backup_rows: details.reduce((s, d) => s + d.backup_rows, 0),
        total_current_rows: details.reduce((s, d) => s + d.current_rows, 0),
        details,
        overall_pass: details.every(d => d.match),
      });
      toast.success(t(`演练完成，耗时 ${(duration / 1000).toFixed(1)}s`, `Drill complete in ${(duration / 1000).toFixed(1)}s`));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDrillRunning(false);
      setDrillTarget(null);
    }
  };

  // Access denied for non-super-admins
  if (!isSuperAdmin) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
          <ShieldAlert className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground font-medium">
            {t("仅限总管理员访问", "Super admin access only")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("您没有权限访问数据备份功能", "You don't have permission to access data backup")}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Backup Actions */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="h-5 w-5" />
              {t("数据备份与恢复", "Data Backup & Recovery")}
            </CardTitle>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleCleanWebhook} disabled={cleaning}>
                {cleaning ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
                {t("清理Webhook队列", "Clean Webhook Queue")}
              </Button>
              <Button size="sm" onClick={handleBackup} disabled={backing}>
                {backing ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Download className="h-4 w-4 mr-1" />}
                {t("立即备份", "Backup Now")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-2">
            {t(
              "备份将保存 9 张关键业务表的完整数据到云存储。系统每6小时自动备份一次，保留最近30个备份。",
              "Backs up 9 critical business tables to cloud storage. System auto-backs up every 6 hours, keeping the last 30 backups."
            )}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-4">
            <Clock className="h-3.5 w-3.5" />
            {t("自动备份间隔: 每6小时", "Auto-backup interval: every 6 hours")}
            <span className="mx-1">·</span>
            <HardDrive className="h-3.5 w-3.5" />
            {t("保留策略: 最近30个 / 7天", "Retention: last 30 / 7 days")}
          </div>

          <Separator className="my-4" />

          {/* Backup History */}
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-medium text-sm">{t("备份历史", "Backup History")}</h4>
            <Button variant="ghost" size="sm" onClick={loadHistory}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t("暂无备份记录", "No backup records")}
            </p>
          ) : (
            <div className="space-y-2">
              {history.map((record) => (
                <div
                  key={record.id}
                  className="p-3 rounded-lg border bg-card hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      {record.status === 'success' ? (
                        <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
                      ) : record.status === 'in_progress' ? (
                        <Loader2 className="h-5 w-5 text-blue-500 animate-spin shrink-0" />
                      ) : (
                        <XCircle className="h-5 w-5 text-destructive shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">
                            {format(new Date(record.created_at), 'yyyy-MM-dd HH:mm:ss')}
                          </span>
                          <Badge variant={record.trigger_type === 'auto' ? 'secondary' : 'outline'} className="text-xs">
                            {record.trigger_type === 'auto' ? t('自动', 'Auto') : t('手动', 'Manual')}
                          </Badge>
                          {record.status === 'success' && record.total_size_bytes > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {formatBytes(record.total_size_bytes)}
                            </Badge>
                          )}
                          {record.status === 'failed' && (
                            <Badge variant="destructive" className="text-xs">
                              {t('失败', 'Failed')}
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5 truncate">
                          {record.status === 'success' && record.tables_backed_up?.map(table => (
                            <span key={table} className="mr-2">
                              {table}: {(record.record_counts as Record<string, number>)?.[table] || 0}
                            </span>
                          ))}
                          {record.status === 'failed' && record.error_message && (
                            <span className="text-destructive">{record.error_message}</span>
                          )}
                          {record.created_by_name && (
                            <span className="ml-2">
                              {t('操作人', 'By')}: {record.created_by_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {record.status === 'success' && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            title={t("查看", "View")}
                            onClick={() => handleView(record.id, record.tables_backed_up)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-primary"
                            title={t("下载JSON", "Download JSON")}
                            disabled={downloading === record.id}
                            onClick={() => handleDownload(record)}
                          >
                            {downloading === record.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-violet-600"
                            title={t("演练恢复", "DR Drill")}
                            disabled={drillRunning && drillTarget === record.id}
                            onClick={() => handleDrDrill(record.id)}
                          >
                            {drillRunning && drillTarget === record.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-amber-600"
                            title={t("恢复", "Restore")}
                            onClick={() => {
                              setRestoreTarget(record.id);
                              setRestoreDangerOpen(true);
                            }}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        title={t("删除", "Delete")}
                        onClick={() => setDeleteTarget(record.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* View Backup Dialog */}
      <Dialog open={!!viewBackupId} onOpenChange={() => setViewBackupId(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {t("查看备份数据", "View Backup Data")}
            </DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 pb-2 flex-wrap">
            {viewBackupTables.map(table => (
              <Button
                key={table}
                size="sm"
                variant={viewTable === table ? 'default' : 'outline'}
                onClick={() => viewBackupId && handleView(viewBackupId, viewBackupTables, table)}
              >
                {table}
              </Button>
            ))}
          </div>
          <div className="overflow-auto flex-1 border rounded-lg">
            {viewLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : viewData.length === 0 ? (
              <p className="text-center py-12 text-muted-foreground text-sm">{t("无数据", "No data")}</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {Object.keys(viewData[0]).slice(0, 8).map(key => (
                      <TableHead key={key} className="text-xs whitespace-nowrap">{key}</TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viewData.map((row, i) => (
                    <TableRow key={i}>
                      {Object.keys(row).slice(0, 8).map(key => (
                        <TableCell key={key} className="text-xs max-w-[150px] truncate">
                          {typeof row[key] === 'object' ? JSON.stringify(row[key]) : String(row[key] ?? '-')}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
          <p className="text-xs text-muted-foreground text-center">
            {t(`显示前50条记录`, `Showing first 50 records`)}
          </p>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认删除备份", "Confirm Delete Backup")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("删除后无法恢复，确定要删除此备份吗？", "This action cannot be undone. Are you sure?")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTarget && handleDelete(deleteTarget)}>
              {t("删除", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore DangerConfirmDialog */}
      <DangerConfirmDialog
        open={restoreDangerOpen}
        onOpenChange={(open) => {
          setRestoreDangerOpen(open);
          if (!open) setRestoreTarget(null);
        }}
        title={t("确认恢复备份", "Confirm Restore Backup")}
        description={t(
          "恢复操作将使用备份数据覆盖现有记录（按主键匹配）。此操作可能影响当前业务数据，请确认后再执行。",
          "Restore will upsert backup data into current tables (matched by primary key). This may affect current business data."
        )}
        confirmText={t("确认恢复", "RESTORE")}
        onConfirm={handleRestore}
      />

      {/* DR Drill Report Dialog */}
      <Dialog open={!!drillReport} onOpenChange={() => setDrillReport(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5" />
              {t("演练恢复报告", "DR Drill Report")}
            </DialogTitle>
          </DialogHeader>
          {drillReport && (
            <div className="space-y-4 overflow-auto flex-1">
              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg border bg-card text-center">
                  <p className="text-xs text-muted-foreground">{t("状态", "Status")}</p>
                  <p className={cn("text-sm font-bold mt-1", drillReport.overall_pass ? "text-green-600" : "text-destructive")}>
                    {drillReport.overall_pass ? t("通过 ✓", "PASS ✓") : t("异常 ✗", "FAIL ✗")}
                  </p>
                </div>
                <div className="p-3 rounded-lg border bg-card text-center">
                  <p className="text-xs text-muted-foreground">{t("耗时", "Duration")}</p>
                  <p className="text-sm font-bold mt-1">{(drillReport.duration_ms / 1000).toFixed(1)}s</p>
                </div>
                <div className="p-3 rounded-lg border bg-card text-center">
                  <p className="text-xs text-muted-foreground">{t("检查表", "Tables")}</p>
                  <p className="text-sm font-bold mt-1">{drillReport.tables_checked}</p>
                </div>
                <div className="p-3 rounded-lg border bg-card text-center">
                  <p className="text-xs text-muted-foreground">{t("备份记录数", "Backup Rows")}</p>
                  <p className="text-sm font-bold mt-1">{drillReport.total_backup_rows.toLocaleString()}</p>
                </div>
              </div>

              <div className="text-xs text-muted-foreground">
                {t("备份时间", "Backup time")}: {drillReport.backup_time ? format(new Date(drillReport.backup_time), 'yyyy-MM-dd HH:mm:ss') : '-'}
                <span className="mx-2">·</span>
                {t("演练时间", "Drill time")}: {format(new Date(drillReport.drill_time), 'yyyy-MM-dd HH:mm:ss')}
              </div>

              {/* Detail table */}
              <div className="border rounded-lg overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">{t("表名", "Table")}</TableHead>
                      <TableHead className="text-xs text-right">{t("备份行数", "Backup")}</TableHead>
                      <TableHead className="text-xs text-right">{t("当前行数", "Current")}</TableHead>
                      <TableHead className="text-xs text-center">{t("一致性", "Status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drillReport.details.map(d => (
                      <TableRow key={d.table}>
                        <TableCell className="text-xs font-mono">{d.table}</TableCell>
                        <TableCell className="text-xs text-right">{d.backup_rows.toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-right">{d.current_rows.toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-center">
                          {d.match ? <CheckCircle className="h-4 w-4 text-green-500 inline" /> : <XCircle className="h-4 w-4 text-destructive inline" />}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Export report */}
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(drillReport, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `dr_drill_report_${format(new Date(drillReport.drill_time), 'yyyyMMdd_HHmmss')}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                <FileDown className="h-4 w-4 mr-1" />
                {t("导出报告", "Export Report")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
