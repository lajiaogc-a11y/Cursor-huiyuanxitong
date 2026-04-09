/**
 * Webhook 表代理：列表、投递日志、增删改（/api/data/table/*，MySQL 列名）
 */
import { dataTableApi } from "@/api/data";
import { getSharedDataTenantId } from "@/services/finance/sharedDataService";

export interface Webhook {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  events: string[];
  status: "active" | "disabled";
  headers: Record<string, string>;
  retryCount: number;
  timeoutMs: number;
  lastTriggeredAt: string | null;
  totalDeliveries: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  remark: string | null;
}

export interface WebhookDeliveryLog {
  id: string;
  webhookId: string | null;
  eventType: string;
  payload: Record<string, unknown>;
  responseStatus: number | null;
  responseBody: string | null;
  responseTimeMs: number | null;
  attemptCount: number;
  success: boolean;
  errorMessage: string | null;
  createdAt: string;
}

function parseEvents(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((e) => String(e));
  if (typeof raw === "string") {
    try {
      const j = JSON.parse(raw) as unknown;
      return Array.isArray(j) ? j.map((e) => String(e)) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapWebhookRow(w: Record<string, unknown>): Webhook {
  const isActive = w.is_active === 1 || w.is_active === true || w.status === "active";
  return {
    id: w.id as string,
    name: w.name as string,
    url: w.url as string,
    secret: w.secret as string | null,
    events: parseEvents(w.events),
    status: isActive ? "active" : "disabled",
    headers: (w.headers as Record<string, string>) || {},
    retryCount: typeof w.retry_count === "number" ? w.retry_count : 3,
    timeoutMs: typeof w.timeout_ms === "number" ? w.timeout_ms : 5000,
    lastTriggeredAt: (w.last_triggered_at as string | null) ?? null,
    totalDeliveries: Number(w.total_deliveries ?? 0),
    successfulDeliveries: Number(w.successful_deliveries ?? 0),
    failedDeliveries: Number(w.failed_deliveries ?? 0),
    createdBy: w.created_by as string | null,
    createdAt: w.created_at as string,
    updatedAt: w.updated_at as string,
    remark: (w.remark as string | null) ?? null,
  };
}

export async function listWebhooks(): Promise<Webhook[]> {
  const tid = getSharedDataTenantId();
  if (!tid) {
    return [];
  }
  const data = await dataTableApi.get<unknown[]>(
    "webhooks",
    `select=*&tenant_id=eq.${encodeURIComponent(tid)}&order=created_at.desc`,
  );
  return (data || []).map((w) => mapWebhookRow(w as Record<string, unknown>));
}

export async function listWebhookDeliveryLogs(webhookId?: string, limit = 50): Promise<WebhookDeliveryLog[]> {
  let q = `select=*&order=created_at.desc&limit=${limit}`;
  if (webhookId) {
    q += `&webhook_id=eq.${encodeURIComponent(webhookId)}`;
  } else {
    const hooks = await listWebhooks();
    if (hooks.length === 0) return [];
    const orClause = hooks.map((h) => `webhook_id.eq.${h.id}`).join(",");
    q += `&or=${encodeURIComponent(orClause)}`;
  }
  const data = await dataTableApi.get<unknown[]>("webhook_delivery_logs", q);
  return (data || []).map((l) => {
    const row = l as Record<string, unknown>;
    const ok = row.success === 1 || row.success === true;
    return {
      id: row.id,
      webhookId: row.webhook_id,
      eventType: row.event_type,
      payload: (row.payload as Record<string, unknown>) || {},
      responseStatus: row.response_status,
      responseBody: row.response_body,
      responseTimeMs: row.response_time_ms ?? null,
      attemptCount: Number(row.attempt ?? row.attempt_count ?? 1),
      success: ok,
      errorMessage: row.error_message as string | null,
      createdAt: row.created_at as string,
    } as WebhookDeliveryLog;
  });
}

export async function createWebhookRecord(body: {
  name: string;
  url: string;
  events: string[];
  secret: string | null;
  headers: Record<string, string>;
  retry_count: number;
  timeout_ms: number;
  remark: string | null;
}): Promise<void> {
  const tenantId = getSharedDataTenantId();
  if (!tenantId) {
    throw new Error("No tenant context for webhook create");
  }
  const data: Record<string, unknown> = {
    tenant_id: tenantId,
    name: body.name,
    url: body.url,
    events: body.events,
    secret: body.secret,
    is_active: 1,
    headers: body.headers && Object.keys(body.headers).length > 0 ? body.headers : null,
    retry_count: body.retry_count ?? 3,
    timeout_ms: body.timeout_ms ?? 5000,
    remark: body.remark || null,
  };
  await dataTableApi.post("webhooks", { data });
}

export async function patchWebhookRecord(
  webhookId: string,
  body: Record<string, unknown>,
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.url !== undefined) data.url = body.url;
  if (body.events !== undefined) data.events = body.events;
  if (body.secret !== undefined) data.secret = body.secret;
  if (body.status !== undefined) {
    data.is_active = body.status === "active" ? 1 : 0;
  }
  if (body.headers !== undefined) data.headers = body.headers;
  if (body.retry_count !== undefined) data.retry_count = body.retry_count;
  if (body.timeout_ms !== undefined) data.timeout_ms = body.timeout_ms;
  if (body.remark !== undefined) data.remark = body.remark;
  if (Object.keys(data).length === 0) return;
  await dataTableApi.patch("webhooks", `id=eq.${encodeURIComponent(webhookId)}`, { data });
}

export async function deleteWebhookRecord(webhookId: string): Promise<void> {
  await dataTableApi.del("webhooks", `id=eq.${encodeURIComponent(webhookId)}`);
}
