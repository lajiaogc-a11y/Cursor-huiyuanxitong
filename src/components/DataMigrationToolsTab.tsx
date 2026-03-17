import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { listTenantsResult, type TenantItem } from "@/services/tenantService";
import {
  executeTenantDataMigrationResult,
  exportTenantMigrationAuditBundleResult,
  exportTenantDataJsonResult,
  getTenantMigrationConflictDetailsResult,
  listTenantMigrationJobsPagedResult,
  previewTenantDataMigrationResult,
  rollbackTenantMigrationJobResult,
  verifyTenantMigrationJobResult,
  type MemberConflictStrategy,
  type TenantMigrationJob,
  type TenantMigrationPreview,
} from "@/services/dataMigrationService";
import { showServiceErrorToast } from "@/services/serviceErrorToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw, Download, FlaskConical } from "lucide-react";

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DataMigrationToolsTab() {
  const { t } = useLanguage();
  const [loading, setLoading] = useState(true);
  const [runningPreview, setRunningPreview] = useState(false);
  const [runningExport, setRunningExport] = useState(false);
  const [runningExecute, setRunningExecute] = useState(false);
  const [downloadingConflicts, setDownloadingConflicts] = useState(false);
  const [rollingBackJobId, setRollingBackJobId] = useState<string | null>(null);
  const [verifyingJobId, setVerifyingJobId] = useState<string | null>(null);
  const [exportingAuditJobId, setExportingAuditJobId] = useState<string | null>(null);
  const [sourceTenantId, setSourceTenantId] = useState("");
  const [targetTenantId, setTargetTenantId] = useState("");
  const [exportLimit, setExportLimit] = useState("5000");
  const [executeLimit, setExecuteLimit] = useState("5000");
  const [memberStrategy, setMemberStrategy] = useState<MemberConflictStrategy>("SKIP");
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [preview, setPreview] = useState<TenantMigrationPreview | null>(null);
  const [verification, setVerification] = useState<Record<string, unknown> | null>(null);
  const [jobs, setJobs] = useState<TenantMigrationJob[]>([]);
  const [jobPage, setJobPage] = useState(1);
  const [jobPageSize, setJobPageSize] = useState(20);
  const [jobOperationFilter, setJobOperationFilter] = useState<string>("ALL");
  const [jobStatusFilter, setJobStatusFilter] = useState<string>("ALL");
  const [jobTotal, setJobTotal] = useState(0);

  const tenantNameMap = useMemo(() => {
    const map = new Map<string, string>();
    tenants.forEach((item) => {
      map.set(item.id, item.tenant_name || item.tenant_code || item.id);
    });
    return map;
  }, [tenants]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tenantResult, jobResult] = await Promise.all([
        listTenantsResult(),
        listTenantMigrationJobsPagedResult({
          page: jobPage,
          pageSize: jobPageSize,
          operation: jobOperationFilter === "ALL" ? undefined : jobOperationFilter,
          status: jobStatusFilter === "ALL" ? undefined : jobStatusFilter,
        }),
      ]);
      if (!tenantResult.ok) {
        showServiceErrorToast(tenantResult.error, t, "加载租户失败", "Failed to load tenants");
      } else {
        setTenants(tenantResult.data);
        if (!sourceTenantId && tenantResult.data[0]?.id) {
          setSourceTenantId(tenantResult.data[0].id);
        }
        if (!targetTenantId && tenantResult.data[1]?.id) {
          setTargetTenantId(tenantResult.data[1].id);
        }
      }
      if (!jobResult.ok) {
        showServiceErrorToast(jobResult.error, t, "加载迁移任务失败", "Failed to load migration jobs");
      } else {
        setJobs(jobResult.data.items);
        setJobTotal(jobResult.data.total);
      }
    } catch (error) {
      console.error(error);
      showServiceErrorToast(error, t, "加载迁移工具失败", "Failed to load migration tools");
    } finally {
      setLoading(false);
    }
  }, [jobOperationFilter, jobPage, jobPageSize, jobStatusFilter, sourceTenantId, targetTenantId, t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const runPreview = useCallback(async () => {
    if (!sourceTenantId || !targetTenantId || sourceTenantId === targetTenantId) {
      toast.error(t("请选择不同的源租户与目标租户", "Please select different source and target tenant"));
      return;
    }
    setRunningPreview(true);
    try {
      const result = await previewTenantDataMigrationResult(sourceTenantId, targetTenantId);
      if (!result.ok) {
        showServiceErrorToast(result.error, t, "预检查失败", "Dry-run preview failed");
        return;
      }
      setPreview(result.data);
      toast.success(t("预检查完成", "Dry-run completed"));
      void loadData();
    } catch (error) {
      console.error(error);
      showServiceErrorToast(error, t, "预检查失败", "Dry-run preview failed");
    } finally {
      setRunningPreview(false);
    }
  }, [loadData, sourceTenantId, targetTenantId, t]);

  const runExport = useCallback(async () => {
    if (!sourceTenantId) {
      toast.error(t("请选择源租户", "Please select source tenant"));
      return;
    }
    setRunningExport(true);
    try {
      const n = Number(exportLimit || 5000);
      const limit = Number.isFinite(n) ? n : 5000;
      const result = await exportTenantDataJsonResult(sourceTenantId, limit);
      if (!result.ok) {
        showServiceErrorToast(result.error, t, "导出失败", "Export failed");
        return;
      }
      const tenantName = tenantNameMap.get(sourceTenantId) || sourceTenantId;
      const safeTenant = tenantName.replace(/[^\w\-]+/g, "_");
      const filename = `tenant_export_${safeTenant}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "_")}.json`;
      downloadJson(filename, result.data);
      toast.success(t("导出成功", "Export completed"));
      void loadData();
    } catch (error) {
      console.error(error);
      showServiceErrorToast(error, t, "导出失败", "Export failed");
    } finally {
      setRunningExport(false);
    }
  }, [exportLimit, loadData, sourceTenantId, t, tenantNameMap]);

  const runConflictDownload = useCallback(async () => {
    if (!sourceTenantId || !targetTenantId || sourceTenantId === targetTenantId) {
      toast.error(t("请选择不同的源租户与目标租户", "Please select different source and target tenant"));
      return;
    }
    setDownloadingConflicts(true);
    try {
      const result = await getTenantMigrationConflictDetailsResult(sourceTenantId, targetTenantId, 2000);
      if (!result.ok) {
        showServiceErrorToast(result.error, t, "获取冲突明细失败", "Failed to get conflict details");
        return;
      }
      const filename = `migration_conflicts_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "_")}.json`;
      downloadJson(filename, result.data);
      toast.success(t("冲突明细已下载", "Conflict detail downloaded"));
    } catch (error) {
      console.error(error);
      showServiceErrorToast(error, t, "获取冲突明细失败", "Failed to get conflict details");
    } finally {
      setDownloadingConflicts(false);
    }
  }, [sourceTenantId, t, targetTenantId]);

  const runExecuteMigration = useCallback(async () => {
    if (!sourceTenantId || !targetTenantId || sourceTenantId === targetTenantId) {
      toast.error(t("请选择不同的源租户与目标租户", "Please select different source and target tenant"));
      return;
    }
    setRunningExecute(true);
    try {
      const n = Number(executeLimit || 5000);
      const limit = Number.isFinite(n) ? n : 5000;
      const result = await executeTenantDataMigrationResult({
        sourceTenantId,
        targetTenantId,
        memberConflictStrategy: memberStrategy,
        limit,
      });
      if (!result.ok) {
        showServiceErrorToast(result.error, t, "执行迁移失败", "Execute migration failed");
        return;
      }
      toast.success(
        t(
          `迁移完成：员工 新增${result.data.migrated_employees}/覆盖${result.data.overwritten_employees}/跳过${result.data.skipped_employees}；会员 新增${result.data.migrated_members}/覆盖${result.data.overwritten_members}/跳过${result.data.skipped_members}；订单 新增${result.data.migrated_orders}/跳过${result.data.skipped_orders}`,
          `Migration done: employees +${result.data.migrated_employees}/~${result.data.overwritten_employees}/skip${result.data.skipped_employees}; members +${result.data.migrated_members}/~${result.data.overwritten_members}/skip${result.data.skipped_members}; orders +${result.data.migrated_orders}/skip${result.data.skipped_orders}`
        )
      );
      void loadData();
    } catch (error) {
      console.error(error);
      showServiceErrorToast(error, t, "执行迁移失败", "Execute migration failed");
    } finally {
      setRunningExecute(false);
    }
  }, [executeLimit, loadData, memberStrategy, sourceTenantId, t, targetTenantId]);

  const runRollback = useCallback(
    async (jobId: string) => {
      setRollingBackJobId(jobId);
      try {
        const result = await rollbackTenantMigrationJobResult(jobId);
        if (!result.ok) {
          showServiceErrorToast(result.error, t, "回滚失败", "Rollback failed");
          return;
        }
        toast.success(t(`回滚完成，恢复 ${result.data.restored} 条`, `Rollback completed, restored ${result.data.restored}`));
        void loadData();
      } catch (error) {
        console.error(error);
        showServiceErrorToast(error, t, "回滚失败", "Rollback failed");
      } finally {
        setRollingBackJobId(null);
      }
    },
    [loadData, t]
  );

  const runVerifyJob = useCallback(
    async (jobId: string) => {
      setVerifyingJobId(jobId);
      try {
        const result = await verifyTenantMigrationJobResult(jobId);
        if (!result.ok) {
          showServiceErrorToast(result.error, t, "校验失败", "Verification failed");
          return;
        }
        setVerification((result.data.verification || {}) as Record<string, unknown>);
        toast.success(t("迁移校验完成", "Migration verification completed"));
        void loadData();
      } catch (error) {
        console.error(error);
        showServiceErrorToast(error, t, "校验失败", "Verification failed");
      } finally {
        setVerifyingJobId(null);
      }
    },
    [loadData, t]
  );

  const runExportAuditBundle = useCallback(
    async (jobId: string) => {
      setExportingAuditJobId(jobId);
      try {
        const result = await exportTenantMigrationAuditBundleResult(jobId, 2000);
        if (!result.ok) {
          showServiceErrorToast(result.error, t, "导出审计包失败", "Export audit bundle failed");
          return;
        }
        const filename = `migration_audit_bundle_${jobId}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "_")}.json`;
        downloadJson(filename, result.data);
        toast.success(t("审计包已导出", "Audit bundle exported"));
      } catch (error) {
        console.error(error);
        showServiceErrorToast(error, t, "导出审计包失败", "Export audit bundle failed");
      } finally {
        setExportingAuditJobId(null);
      }
    },
    [t]
  );

  const runVerifyAndExport = useCallback(
    async (jobId: string) => {
      setVerifyingJobId(jobId);
      try {
        const verifyResult = await verifyTenantMigrationJobResult(jobId);
        if (!verifyResult.ok) {
          showServiceErrorToast(verifyResult.error, t, "校验失败", "Verification failed");
          return;
        }
        setVerification((verifyResult.data.verification || {}) as Record<string, unknown>);
        const auditResult = await exportTenantMigrationAuditBundleResult(jobId, 2000);
        if (!auditResult.ok) {
          showServiceErrorToast(auditResult.error, t, "导出审计包失败", "Export audit bundle failed");
          return;
        }
        const filename = `migration_audit_bundle_${jobId}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "_")}.json`;
        downloadJson(filename, auditResult.data);
        toast.success(t("校验并导出完成", "Verify and export completed"));
        void loadData();
      } catch (error) {
        console.error(error);
        showServiceErrorToast(error, t, "校验并导出失败", "Verify and export failed");
      } finally {
        setVerifyingJobId(null);
      }
    },
    [loadData, t]
  );

  return (
    <div className="space-y-5">
      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-base font-semibold">{t("数据迁移工具（收口版）", "Data Migration Tools (Hardening)")}</h3>
        <p className="text-sm text-muted-foreground">
          {t("支持 dry-run、冲突明细下载、执行迁移（员工+会员+订单）和可回滚日志。", "Supports dry-run, conflict detail export, execute migration (employees+members+orders), and rollback logs.")}
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t("源租户", "Source Tenant")}</p>
            <Select value={sourceTenantId} onValueChange={setSourceTenantId}>
              <SelectTrigger>
                <SelectValue placeholder={t("请选择", "Select")} />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {(tenant.tenant_name || tenant.tenant_code || tenant.id) as string}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t("目标租户（dry-run用）", "Target Tenant (for dry-run)")}</p>
            <Select value={targetTenantId} onValueChange={setTargetTenantId}>
              <SelectTrigger>
                <SelectValue placeholder={t("请选择", "Select")} />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {(tenant.tenant_name || tenant.tenant_code || tenant.id) as string}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t("导出上限（100-20000）", "Export limit (100-20000)")}</p>
            <Input value={exportLimit} onChange={(e) => setExportLimit(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={() => void runPreview()} disabled={runningPreview}>
              {runningPreview ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <FlaskConical className="h-4 w-4 mr-2" />}
              {t("执行预检查", "Run Dry-Run")}
            </Button>
            <Button variant="outline" onClick={() => void runExport()} disabled={runningExport}>
              {runningExport ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              {t("导出JSON", "Export JSON")}
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t("执行上限（1-20000）", "Execute limit (1-20000)")}</p>
            <Input value={executeLimit} onChange={(e) => setExecuteLimit(e.target.value)} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t("会员冲突策略", "Member conflict strategy")}</p>
            <Select value={memberStrategy} onValueChange={(v) => setMemberStrategy(v as MemberConflictStrategy)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SKIP">{t("跳过冲突", "Skip conflicts")}</SelectItem>
                <SelectItem value="OVERWRITE">{t("覆盖目标", "Overwrite target")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end gap-2 lg:col-span-2">
            <Button variant="outline" onClick={() => void runConflictDownload()} disabled={downloadingConflicts}>
              {downloadingConflicts ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              {t("下载冲突明细", "Download conflicts")}
            </Button>
            <Button onClick={() => void runExecuteMigration()} disabled={runningExecute}>
              {runningExecute ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <FlaskConical className="h-4 w-4 mr-2" />}
              {t("执行迁移", "Execute migration")}
            </Button>
          </div>
        </div>
      </div>

      {preview && (
        <div className="rounded-lg border p-4 space-y-2">
          <div className="text-sm font-medium">{t("最近一次 dry-run 结果", "Latest dry-run result")}</div>
          <div className="text-xs text-muted-foreground">
            {t("风险等级", "Risk level")}: <span className="font-semibold">{preview.risk_level}</span>
          </div>
          <pre className="text-xs bg-muted rounded p-3 overflow-auto">{JSON.stringify(preview, null, 2)}</pre>
        </div>
      )}

      {verification && (
        <div className="rounded-lg border p-4 space-y-2">
          <div className="text-sm font-medium">{t("最近一次迁移校验结果", "Latest migration verification")}</div>
          <pre className="text-xs bg-muted rounded p-3 overflow-auto">{JSON.stringify(verification, null, 2)}</pre>
        </div>
      )}

      <div className="rounded-lg border overflow-hidden">
        <div className="p-3 border-b flex items-center justify-between">
          <div className="text-sm font-medium">{t("迁移任务日志", "Migration Job Logs")}</div>
          <div className="flex items-center gap-2">
            <Select value={jobOperationFilter} onValueChange={(v) => { setJobOperationFilter(v); setJobPage(1); }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("全部类型", "All operations")}</SelectItem>
                <SelectItem value="DRY_RUN">DRY_RUN</SelectItem>
                <SelectItem value="EXPORT">EXPORT</SelectItem>
                <SelectItem value="EXECUTE">EXECUTE</SelectItem>
              </SelectContent>
            </Select>
            <Select value={jobStatusFilter} onValueChange={(v) => { setJobStatusFilter(v); setJobPage(1); }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t("全部状态", "All status")}</SelectItem>
                <SelectItem value="running">running</SelectItem>
                <SelectItem value="success">success</SelectItem>
                <SelectItem value="failed">failed</SelectItem>
                <SelectItem value="rolled_back">rolled_back</SelectItem>
              </SelectContent>
            </Select>
            <Select value={String(jobPageSize)} onValueChange={(v) => { setJobPageSize(Number(v)); setJobPage(1); }}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10">10</SelectItem>
                <SelectItem value="20">20</SelectItem>
                <SelectItem value="50">50</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => void loadData()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              {t("刷新", "Refresh")}
            </Button>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("时间", "Time")}</TableHead>
              <TableHead>{t("类型", "Operation")}</TableHead>
              <TableHead>{t("源租户", "Source")}</TableHead>
              <TableHead>{t("目标租户", "Target")}</TableHead>
              <TableHead>{t("状态", "Status")}</TableHead>
              <TableHead>{t("操作", "Action")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {jobs.map((job) => (
              <TableRow key={job.id}>
                <TableCell>{new Date(job.created_at).toLocaleString()}</TableCell>
                <TableCell>{job.operation}</TableCell>
                <TableCell>{tenantNameMap.get(job.source_tenant_id) || job.source_tenant_id}</TableCell>
                <TableCell>{job.target_tenant_id ? (tenantNameMap.get(job.target_tenant_id) || job.target_tenant_id) : "-"}</TableCell>
                <TableCell>{job.status}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2 flex-wrap">
                    {job.operation === "EXECUTE" ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void runVerifyJob(job.id)}
                          disabled={verifyingJobId === job.id}
                        >
                          {verifyingJobId === job.id ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : null}
                          {t("校验", "Verify")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void runExportAuditBundle(job.id)}
                          disabled={exportingAuditJobId === job.id}
                        >
                          {exportingAuditJobId === job.id ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : null}
                          {t("审计包", "Audit Bundle")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void runVerifyAndExport(job.id)}
                          disabled={verifyingJobId === job.id || exportingAuditJobId === job.id}
                        >
                          {(verifyingJobId === job.id || exportingAuditJobId === job.id) ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : null}
                          {t("一键校验导出", "Verify + Export")}
                        </Button>
                        {job.status === "success" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void runRollback(job.id)}
                            disabled={rollingBackJobId === job.id}
                          >
                            {rollingBackJobId === job.id ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : null}
                            {t("回滚", "Rollback")}
                          </Button>
                        ) : null}
                      </>
                    ) : (
                      "-"
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {jobs.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                  {t("暂无迁移日志", "No migration logs")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <div className="p-3 border-t flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {t("总数", "Total")}: {jobTotal}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={jobPage <= 1 || loading}
              onClick={() => setJobPage((p) => Math.max(1, p - 1))}
            >
              {t("上一页", "Prev")}
            </Button>
            <span className="text-xs text-muted-foreground">{jobPage}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={jobPage * jobPageSize >= jobTotal || loading}
              onClick={() => setJobPage((p) => p + 1)}
            >
              {t("下一页", "Next")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
