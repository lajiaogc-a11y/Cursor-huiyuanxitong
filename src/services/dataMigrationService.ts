import { supabase } from "@/integrations/supabase/client";
import { fail, ok, type ServiceErrorCode, type ServiceResult } from "@/services/serviceResult";

export interface TenantMigrationPreview {
  source_tenant_id: string;
  target_tenant_id: string;
  source_counts: Record<string, number>;
  target_counts: Record<string, number>;
  conflict_summary: Record<string, number>;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | string;
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
  message: string;
}

const mapErr = (msg?: string): ServiceErrorCode => {
  if (!msg) return "UNKNOWN";
  if (msg === "NO_PERMISSION") return "NO_PERMISSION";
  if (msg === "TENANT_REQUIRED") return "TENANT_REQUIRED";
  if (msg === "INVALID_TENANT") return "TENANT_REQUIRED";
  if (msg === "JOB_REQUIRED") return "TARGET_NOT_FOUND";
  if (msg === "JOB_NOT_FOUND") return "TARGET_NOT_FOUND";
  return "UNKNOWN";
};

export async function previewTenantDataMigrationResult(
  sourceTenantId: string,
  targetTenantId: string
): Promise<ServiceResult<TenantMigrationPreview>> {
  const { data, error } = await (supabase.rpc as any)("preview_tenant_data_migration", {
    p_source_tenant_id: sourceTenantId,
    p_target_tenant_id: targetTenantId,
  });
  if (error) return fail(mapErr(error.message), error.message, "tenant");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.source_tenant_id) return fail("UNKNOWN", "Preview failed", "tenant");
  return ok(row as TenantMigrationPreview);
}

export async function exportTenantDataJsonResult(
  sourceTenantId: string,
  limit = 5000
): Promise<ServiceResult<Record<string, unknown>>> {
  const { data, error } = await (supabase.rpc as any)("export_tenant_data_json", {
    p_source_tenant_id: sourceTenantId,
    p_limit: limit,
  });
  if (error) return fail(mapErr(error.message), error.message, "tenant");
  const payload = data as Record<string, unknown>;
  if (!payload || payload.success !== true) {
    const message = String(payload?.message || "Export failed");
    return fail(mapErr(message), message, "tenant");
  }
  return ok(payload);
}

export async function listTenantMigrationJobsResult(limit = 100): Promise<ServiceResult<TenantMigrationJob[]>> {
  const { data, error } = await (supabase.rpc as any)("list_tenant_migration_jobs", {
    p_limit: limit,
  });
  if (error) return fail(mapErr(error.message), error.message, "tenant");
  return ok((data || []) as TenantMigrationJob[]);
}

export async function listTenantMigrationJobsPagedResult(input: {
  page: number;
  pageSize: number;
  operation?: string;
  status?: string;
}): Promise<ServiceResult<{ items: TenantMigrationJob[]; total: number }>> {
  const { data, error } = await (supabase.rpc as any)("list_tenant_migration_jobs_v2", {
    p_page: input.page,
    p_page_size: input.pageSize,
    p_operation: input.operation || null,
    p_status: input.status || null,
  });
  if (error) return fail(mapErr(error.message), error.message, "tenant");
  const rows = (data || []) as TenantMigrationJob[];
  const total = Number(rows[0]?.total_count ?? 0);
  return ok({ items: rows, total });
}

export async function getTenantMigrationConflictDetailsResult(
  sourceTenantId: string,
  targetTenantId: string,
  limit = 500
): Promise<ServiceResult<Record<string, unknown>>> {
  const { data, error } = await (supabase.rpc as any)("get_tenant_migration_conflict_details", {
    p_source_tenant_id: sourceTenantId,
    p_target_tenant_id: targetTenantId,
    p_limit: limit,
  });
  if (error) return fail(mapErr(error.message), error.message, "tenant");
  const payload = data as Record<string, unknown>;
  if (!payload || payload.success !== true) {
    const message = String(payload?.message || "Conflict detail failed");
    return fail(mapErr(message), message, "tenant");
  }
  return ok(payload);
}

export async function executeTenantDataMigrationResult(input: {
  sourceTenantId: string;
  targetTenantId: string;
  memberConflictStrategy: MemberConflictStrategy;
  limit: number;
}): Promise<ServiceResult<ExecuteMigrationResult>> {
  const { data, error } = await (supabase.rpc as any)("execute_tenant_data_migration", {
    p_source_tenant_id: input.sourceTenantId,
    p_target_tenant_id: input.targetTenantId,
    p_member_conflict_strategy: input.memberConflictStrategy,
    p_limit: input.limit,
  });
  if (error) return fail(mapErr(error.message), error.message, "tenant");
  const row = (Array.isArray(data) ? data[0] : data) as ExecuteMigrationResult | undefined;
  if (!row) return fail("UNKNOWN", "Execute migration failed", "tenant");
  if (row.message && row.message !== "OK") {
    return fail(mapErr(row.message), row.message, "tenant");
  }
  return ok(row);
}

export async function rollbackTenantMigrationJobResult(jobId: string): Promise<ServiceResult<{ restored: number }>> {
  const { data, error } = await (supabase.rpc as any)("rollback_tenant_migration_job", {
    p_job_id: jobId,
  });
  if (error) return fail(mapErr(error.message), error.message, "tenant");
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.success) {
    const message = String(row?.message || "Rollback failed");
    return fail(mapErr(message), message, "tenant");
  }
  return ok({ restored: Number(row?.restored ?? 0) });
}

export async function verifyTenantMigrationJobResult(
  jobId: string
): Promise<ServiceResult<MigrationVerificationPayload>> {
  const { data, error } = await (supabase.rpc as any)("verify_tenant_migration_job", {
    p_job_id: jobId,
  });
  if (error) return fail(mapErr(error.message), error.message, "tenant");
  const payload = data as Record<string, unknown>;
  if (!payload || payload.success !== true) {
    const message = String(payload?.message || "Verify failed");
    return fail(mapErr(message), message, "tenant");
  }
  return ok(payload as MigrationVerificationPayload);
}

export async function exportTenantMigrationAuditBundleResult(
  jobId: string,
  conflictLimit = 2000
): Promise<ServiceResult<Record<string, unknown>>> {
  const { data, error } = await (supabase.rpc as any)("export_tenant_migration_audit_bundle", {
    p_job_id: jobId,
    p_conflict_limit: conflictLimit,
  });
  if (error) return fail(mapErr(error.message), error.message, "tenant");
  const payload = data as Record<string, unknown>;
  if (!payload || payload.success !== true) {
    const message = String(payload?.message || "Export audit bundle failed");
    return fail(mapErr(message), message, "tenant");
  }
  return ok(payload);
}
