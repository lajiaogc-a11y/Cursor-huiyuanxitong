import { apiClient } from "@/lib/apiClient";

export interface OperationLogsResult {
  logs: Array<{
    id: string;
    timestamp: string;
    operatorId: string | null;
    operatorAccount: string;
    operatorRole: string;
    module: string;
    operationType: string;
    objectId: string | null;
    objectDescription: string | null;
    beforeData: unknown;
    afterData: unknown;
    ipAddress: string | null;
    isRestored: boolean;
    restoredBy: string | null;
    restoredAt: string | null;
  }>;
  totalCount: number;
}

export interface OperationLogsQuery {
  page?: number;
  pageSize?: number;
  module?: string;
  operationType?: string;
  operatorAccount?: string;
  restoreStatus?: string;
  searchTerm?: string;
  dateStart?: string;
  dateEnd?: string;
  tenantId?: string | null;
}

export interface PostOperationLogParams {
  operatorId?: string | null;
  operatorAccount?: string;
  operatorRole?: string;
  module: string;
  operationType: string;
  objectId?: string | null;
  objectDescription?: string | null;
  beforeData?: unknown;
  afterData?: unknown;
  ipAddress?: string | null;
}

export async function postOperationLog(params: PostOperationLogParams): Promise<void> {
  await apiClient.post("/api/data/operation-logs", params);
}

export async function getOperationLogs(query: OperationLogsQuery): Promise<OperationLogsResult> {
  const params = new URLSearchParams();
  if (query.page != null) params.set("page", String(query.page));
  if (query.pageSize != null) params.set("pageSize", String(query.pageSize));
  if (query.module) params.set("module", query.module);
  if (query.operationType) params.set("operationType", query.operationType);
  if (query.operatorAccount) params.set("operatorAccount", query.operatorAccount);
  if (query.restoreStatus) params.set("restoreStatus", query.restoreStatus);
  if (query.searchTerm) params.set("searchTerm", query.searchTerm);
  if (query.dateStart) params.set("dateStart", query.dateStart);
  if (query.dateEnd) params.set("dateEnd", query.dateEnd);
  if (query.tenantId) params.set("tenant_id", query.tenantId);
  const q = params.toString();
  const res = await apiClient.get<unknown>(`/api/logs/audit${q ? `?${q}` : ""}`);
  const raw = res as Record<string, unknown>;
  const payload = raw?.data ?? raw;
  const p = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const logs = (Array.isArray(p?.logs) ? p.logs : []) as OperationLogsResult["logs"];
  const totalCount = Number(p?.totalCount ?? 0) || 0;
  return { logs, totalCount };
}
