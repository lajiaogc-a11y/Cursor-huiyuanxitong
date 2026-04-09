/**
 * Data Migration API Client — 租户数据迁移 RPC 请求层
 */
import { apiPost } from './client';

export const dataMigrationApi = {
  preview: (sourceTenantId: string, targetTenantId: string) =>
    apiPost<unknown>('/api/data/rpc/preview_tenant_data_migration', {
      p_source_tenant_id: sourceTenantId,
      p_target_tenant_id: targetTenantId,
    }),

  exportJson: (sourceTenantId: string, limit: number) =>
    apiPost<Record<string, unknown>>('/api/data/rpc/export_tenant_data_json', {
      p_source_tenant_id: sourceTenantId,
      p_limit: limit,
    }),

  listJobs: (limit: number) =>
    apiPost<unknown[]>('/api/data/rpc/list_tenant_migration_jobs', { p_limit: limit }),

  listJobsPaged: (params: { p_page: number; p_page_size: number; p_operation: string | null; p_status: string | null }) =>
    apiPost<unknown[]>('/api/data/rpc/list_tenant_migration_jobs_v2', params),

  getConflictDetails: (sourceTenantId: string, targetTenantId: string, limit: number) =>
    apiPost<Record<string, unknown>>('/api/data/rpc/get_tenant_migration_conflict_details', {
      p_source_tenant_id: sourceTenantId,
      p_target_tenant_id: targetTenantId,
      p_limit: limit,
    }),

  execute: (params: Record<string, unknown>) =>
    apiPost<unknown>('/api/data/rpc/execute_tenant_data_migration', params),

  rollback: (jobId: string) =>
    apiPost<unknown>('/api/data/rpc/rollback_tenant_migration_job', { p_job_id: jobId }),

  verify: (jobId: string) =>
    apiPost<Record<string, unknown>>('/api/data/rpc/verify_tenant_migration_job', { p_job_id: jobId }),

  exportAuditBundle: (jobId: string, conflictLimit: number) =>
    apiPost<Record<string, unknown>>('/api/data/rpc/export_tenant_migration_audit_bundle', {
      p_job_id: jobId,
      p_conflict_limit: conflictLimit,
    }),
};
