import { dataRpcApi } from "@/api/data";
import { fail, ok, type ServiceErrorCode, type ServiceResult } from "@/services/serviceResult";

export interface TenantMigrationPreview {
  source_tenant_id: string;
  target_tenant_id: string;
  source_counts: Record<string, number>;
  target_counts: Record<string, number>;
  conflict_summary: Record<string, number>;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | string;
  /** 预检时源租户在扩展表上的行数合计（用于 HIGH 风险判定之一） */
  extra_row_volume_hint?: number;
}

export interface TenantMigrationJob {
  id: string;
  source_tenant_id: string;
  target_tenant_id: string | null;
  operation: string;
  status: string;
  report: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  total_count?: number;
}

export type MemberConflictStrategy = "SKIP" | "OVERWRITE";

export interface MigrationVerificationPayload {
  success: boolean;
  verification?: Record<string, unknown>;
}

export interface ExecuteMigrationResult {
  job_id: string | null;
  migrated_members: number;
  overwritten_members: number;
  skipped_members: number;
  migrated_employees: number;
  overwritten_employees: number;
  skipped_employees: number;
  migrated_orders: number;
  skipped_orders: number;
  migrated_activity_gifts?: number;
  message: string;
  extra_migrated?: Record<string, number>;
  extra_errors?: Record<string, string>;
  singleton_migrated?: Record<string, number>;
  singleton_errors?: Record<string, string>;
}

const MYSQL_STUB_MSG =
  "服务端返回 mysql_migration_unavailable：当前环境未开放租户迁移 RPC（或仍为占位响应）。若已切换自建 MySQL 后端，请检查 tableProxy / 部署版本。";

const mapErr = (msg?: string): ServiceErrorCode => {
  if (!msg) return "UNKNOWN";
  if (msg === "NO_PERMISSION") return "NO_PERMISSION";
  if (msg === "TENANT_REQUIRED") return "TENANT_REQUIRED";
  if (msg === "INVALID_TENANT") return "TENANT_REQUIRED";
  if (msg === "JOB_REQUIRED") return "TARGET_NOT_FOUND";
  if (msg === "JOB_NOT_FOUND") return "TARGET_NOT_FOUND";
  return "UNKNOWN";
};

function assertNoMysqlMigrationStub(row: unknown): ServiceResult<never> | null {
  if (
    row &&
    typeof row === "object" &&
    (row as { mysql_migration_unavailable?: boolean }).mysql_migration_unavailable
  ) {
    return fail("UNKNOWN", MYSQL_STUB_MSG, "TENANT");
  }
  return null;
}

export async function previewTenantDataMigrationResult(
  sourceTenantId: string,
  targetTenantId: string,
): Promise<ServiceResult<TenantMigrationPreview>> {
  try {
    const data = await dataRpcApi.call<unknown>("preview_tenant_data_migration", {
      p_source_tenant_id: sourceTenantId,
      p_target_tenant_id: targetTenantId,
    });
    const row = Array.isArray(data) ? data[0] : data;
    const stub = assertNoMysqlMigrationStub(row);
    if (stub) return stub;
    if (!row || typeof row !== "object" || !(row as TenantMigrationPreview).source_tenant_id) {
      return fail("UNKNOWN", "Preview failed", "TENANT");
    }
    return ok(row as TenantMigrationPreview);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return fail(mapErr(message), message, "TENANT");
  }
}

export async function exportTenantDataJsonResult(
  sourceTenantId: string,
  limit = 5000,
): Promise<ServiceResult<Record<string, unknown>>> {
  try {
    const data = await dataRpcApi.call<Record<string, unknown>>("export_tenant_data_json", {
      p_source_tenant_id: sourceTenantId,
      p_limit: limit,
    });
    const payload = data;
    const stub = assertNoMysqlMigrationStub(payload);
    if (stub) return stub;
    if (!payload || payload.success !== true) {
      const message = String(payload?.message || "Export failed");
      return fail(mapErr(message), message, "TENANT");
    }
    return ok(payload);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return fail(mapErr(message), message, "TENANT");
  }
}

export async function listTenantMigrationJobsResult(limit = 100): Promise<ServiceResult<TenantMigrationJob[]>> {
  try {
    const data = await dataRpcApi.call<TenantMigrationJob[]>("list_tenant_migration_jobs", {
      p_limit: limit,
    });
    return ok((data || []) as TenantMigrationJob[]);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return fail(mapErr(message), message, "TENANT");
  }
}

export async function listTenantMigrationJobsPagedResult(input: {
  page: number;
  pageSize: number;
  operation?: string;
  status?: string;
}): Promise<ServiceResult<{ items: TenantMigrationJob[]; total: number }>> {
  try {
    const data = await dataRpcApi.call<TenantMigrationJob[]>("list_tenant_migration_jobs_v2", {
      p_page: input.page,
      p_page_size: input.pageSize,
      p_operation: input.operation || null,
      p_status: input.status || null,
    });
    const rows = (data || []) as TenantMigrationJob[];
    const total = Number(rows[0]?.total_count ?? 0);
    return ok({ items: rows, total });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return fail(mapErr(message), message, "TENANT");
  }
}

export async function getTenantMigrationConflictDetailsResult(
  sourceTenantId: string,
  targetTenantId: string,
  limit = 500,
): Promise<ServiceResult<Record<string, unknown>>> {
  try {
    const data = await dataRpcApi.call<Record<string, unknown>>("get_tenant_migration_conflict_details", {
      p_source_tenant_id: sourceTenantId,
      p_target_tenant_id: targetTenantId,
      p_limit: limit,
    });
    const payload = data;
    const stub = assertNoMysqlMigrationStub(payload);
    if (stub) return stub;
    if (!payload || payload.success !== true) {
      const message = String(payload?.message || "Conflict detail failed");
      return fail(mapErr(message), message, "TENANT");
    }
    return ok(payload);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return fail(mapErr(message), message, "TENANT");
  }
}

export async function executeTenantDataMigrationResult(input: {
  sourceTenantId: string;
  targetTenantId: string;
  memberConflictStrategy: MemberConflictStrategy;
  limit: number;
}): Promise<ServiceResult<ExecuteMigrationResult>> {
  try {
    const data = await dataRpcApi.call<unknown>("execute_tenant_data_migration", {
      p_source_tenant_id: input.sourceTenantId,
      p_target_tenant_id: input.targetTenantId,
      p_member_conflict_strategy: input.memberConflictStrategy,
      p_limit: input.limit,
    });
    const row = (Array.isArray(data) ? data[0] : data) as ExecuteMigrationResult | undefined;
    const stub = assertNoMysqlMigrationStub(row);
    if (stub) return stub;
    if (!row) return fail("UNKNOWN", "Execute migration failed", "TENANT");
    if (row.message && row.message !== "OK") {
      return fail(mapErr(row.message), row.message, "TENANT");
    }
    return ok(row);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return fail(mapErr(message), message, "TENANT");
  }
}

export async function rollbackTenantMigrationJobResult(jobId: string): Promise<ServiceResult<{ restored: number }>> {
  try {
    const data = await dataRpcApi.call<unknown>("rollback_tenant_migration_job", {
      p_job_id: jobId,
    });
    const row = Array.isArray(data) ? data[0] : data;
    const stub = assertNoMysqlMigrationStub(row);
    if (stub) return stub;
    if (!row || typeof row !== "object" || !(row as { success?: boolean }).success) {
      const message = String((row as { message?: string })?.message || "Rollback failed");
      return fail(mapErr(message), message, "TENANT");
    }
    return ok({ restored: Number((row as { restored?: number }).restored ?? 0) });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return fail(mapErr(message), message, "TENANT");
  }
}

export async function verifyTenantMigrationJobResult(
  jobId: string,
): Promise<ServiceResult<MigrationVerificationPayload>> {
  try {
    const data = await dataRpcApi.call<Record<string, unknown>>("verify_tenant_migration_job", {
      p_job_id: jobId,
    });
    const payload = data;
    const stub = assertNoMysqlMigrationStub(payload);
    if (stub) return stub;
    if (!payload || payload.success !== true) {
      const message = String(payload?.message || "Verify failed");
      return fail(mapErr(message), message, "TENANT");
    }
    return ok(payload as unknown as MigrationVerificationPayload);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return fail(mapErr(message), message, "TENANT");
  }
}

export async function exportTenantMigrationAuditBundleResult(
  jobId: string,
  conflictLimit = 2000,
): Promise<ServiceResult<Record<string, unknown>>> {
  try {
    const data = await dataRpcApi.call<Record<string, unknown>>("export_tenant_migration_audit_bundle", {
      p_job_id: jobId,
      p_conflict_limit: conflictLimit,
    });
    const payload = data;
    const stub = assertNoMysqlMigrationStub(payload);
    if (stub) return stub;
    if (!payload || payload.success !== true) {
      const message = String(payload?.message || "Export audit bundle failed");
      return fail(mapErr(message), message, "TENANT");
    }
    return ok(payload);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return fail(mapErr(message), message, "TENANT");
  }
}
