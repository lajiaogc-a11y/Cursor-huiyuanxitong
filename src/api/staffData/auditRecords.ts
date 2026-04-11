import { apiClient } from "@/lib/apiClient";

export async function getAuditRecordsApi(params?: {
  page?: number;
  pageSize?: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  tenantId?: string | null;
  searchTerm?: string;
}): Promise<{ records: any[]; totalCount: number }> {
  const q = new URLSearchParams();
  if (params?.page) q.set("page", String(params.page));
  if (params?.pageSize) q.set("pageSize", String(params.pageSize));
  if (params?.status) q.set("status", params.status);
  if (params?.dateFrom) q.set("dateFrom", params.dateFrom);
  if (params?.dateTo) q.set("dateTo", params.dateTo);
  if (params?.tenantId) q.set("tenant_id", params.tenantId);
  if (params?.searchTerm) q.set("searchTerm", params.searchTerm);
  const res = await apiClient.get<unknown>(`/api/data/audit-records${q.toString() ? `?${q.toString()}` : ""}`);
  const raw = res as Record<string, unknown>;
  const data = raw?.data && typeof raw.data === "object" ? (raw.data as Record<string, unknown>) : raw;
  return {
    records: Array.isArray(data?.records) ? (data.records as Record<string, unknown>[]) : [],
    totalCount: Number(data?.totalCount ?? 0) || 0,
  };
}

export async function getPendingAuditCountApi(tenantId?: string | null): Promise<number> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
  const res = await apiClient.get<unknown>(`/api/data/audit-records/pending-count${q}`);
  const raw = res as Record<string, unknown>;
  const data = raw?.data && typeof raw.data === "object" ? (raw.data as Record<string, unknown>) : raw;
  return Number(data?.count ?? 0) || 0;
}
