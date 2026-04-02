import { apiClient } from "@/lib/apiClient";

export interface LoginLogRow {
  id: string;
  employee_id: string | null;
  employee_name: string;
  login_time: string;
  ip_address: string | null;
  ip_location?: string | null;
  success: boolean | null;
  failure_reason: string | null;
  user_agent: string | null;
}

export interface LoginLogsResponse {
  rows: LoginLogRow[];
  total: number;
  page: number;
  page_size: number;
}

export async function getLoginLogs(
  pageSize?: number,
  tenantId?: string | null,
  page?: number
): Promise<LoginLogsResponse> {
  const params = new URLSearchParams();
  if (pageSize != null) params.set("page_size", String(pageSize));
  if (page != null) params.set("page", String(page));
  if (tenantId) params.set("tenant_id", tenantId);
  const q = params.toString();
  const payload = await apiClient.get<
    | LoginLogsResponse
    | { rows: LoginLogRow[]; total: number; page: number; page_size: number }
    | LoginLogRow[]
  >(`/api/logs/login${q ? `?${q}` : ""}`);
  if (Array.isArray(payload)) {
    return {
      rows: payload,
      total: payload.length,
      page: page ?? 1,
      page_size: pageSize ?? 100,
    };
  }
  const rows = payload.rows ?? [];
  return {
    rows,
    total: typeof payload.total === 'number' ? payload.total : rows.length,
    page: typeof payload.page === 'number' ? payload.page : 1,
    page_size: typeof payload.page_size === 'number' ? payload.page_size : (pageSize ?? 100),
  };
}
