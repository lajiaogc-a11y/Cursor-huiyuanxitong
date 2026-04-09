/**
 * 前端异常上报（error_reports 表代理，经 /api/data/table/error_reports）
 */
import { fetchTableSelectRaw } from "@/api/tableProxyRaw";
import { dataTableApi } from "@/api/data";

export type ErrorReportPayload = {
  error_id: string;
  error_message: string;
  error_stack?: string | null;
  component_stack?: string | null;
  url?: string | null;
  user_agent?: string | null;
  employee_id?: string | null;
  metadata?: Record<string, unknown>;
};

/** 员工端列表展示用行（与表字段一致，多余字段由后端忽略） */
export type ErrorReportRow = {
  id: string;
  error_id?: string | null;
  created_at: string;
  error_message: string;
  error_stack: string | null;
  component_stack: string | null;
  url: string | null;
  user_agent: string | null;
  employee_id: string | null;
  /** 表列 context，经代理映射为 metadata */
  metadata?: Record<string, unknown> | null;
};

function coerceString(v: unknown, fallback = ""): string {
  if (v == null) return fallback;
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function coerceNullableString(v: unknown): string | null {
  if (v == null) return null;
  return coerceString(v);
}

/** 统一为字符串，避免接口/驱动返回非字符串导致分类与展示异常 */
export function normalizeErrorReportRows(raw: unknown): ErrorReportRow[] {
  if (!Array.isArray(raw)) return [];
  const out: ErrorReportRow[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const id = r.id != null ? String(r.id) : "";
    if (!id) continue;
    let meta: Record<string, unknown> | null = null;
    const m = r.metadata ?? r.context;
    if (m != null && typeof m === "object" && !Array.isArray(m)) {
      meta = m as Record<string, unknown>;
    } else if (typeof m === "string" && m.trim()) {
      try {
        const parsed = JSON.parse(m) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          meta = parsed as Record<string, unknown>;
        }
      } catch {
        /* ignore */
      }
    }
    out.push({
      id,
      error_id: r.error_id != null ? String(r.error_id) : null,
      created_at: r.created_at != null ? String(r.created_at) : "",
      error_message: coerceString(r.error_message),
      error_stack: coerceNullableString(r.error_stack),
      component_stack: coerceNullableString(r.component_stack),
      url: coerceNullableString(r.url),
      user_agent: coerceNullableString(r.user_agent),
      employee_id: r.employee_id != null ? String(r.employee_id) : null,
      metadata: meta,
    });
  }
  return out;
}

/** 同一指纹在窗口内只上报一次，避免路由重渲染 / 严格模式 / 网络抖动产生上百条重复记录 */
const DEDUPE_TTL_MS = 5 * 60 * 1000;
const dedupeLastSent = new Map<string, number>();

function pathnameFromPayload(p: ErrorReportPayload): string {
  const meta = p.metadata;
  if (meta && typeof meta.pathname === "string" && meta.pathname.trim()) {
    return meta.pathname.trim();
  }
  if (typeof p.url === "string" && p.url.trim()) {
    try {
      return new URL(p.url).pathname;
    } catch {
      return "";
    }
  }
  return "";
}

function sourceFromPayload(p: ErrorReportPayload): string {
  const meta = p.metadata;
  if (meta && typeof meta.source === "string") return meta.source;
  return "";
}

function reportFingerprint(p: ErrorReportPayload): string {
  const msg = (p.error_message || "").trim().replace(/\s+/g, " ").slice(0, 500);
  return `${sourceFromPayload(p)}|${pathnameFromPayload(p)}|${msg}`;
}

function pruneDedupeMap(now: number): void {
  if (dedupeLastSent.size < 250) return;
  for (const [k, t] of dedupeLastSent) {
    if (now - t > DEDUPE_TTL_MS) dedupeLastSent.delete(k);
  }
}

export async function submitErrorReport(payload: ErrorReportPayload): Promise<void> {
  const now = Date.now();
  const fp = reportFingerprint(payload);
  const last = dedupeLastSent.get(fp);
  if (last != null && now - last < DEDUPE_TTL_MS) {
    return;
  }
  dedupeLastSent.set(fp, now);
  pruneDedupeMap(now);

  await dataTableApi.post("error_reports", { data: payload });
}

/** PostgREST 风格 count：limit=0 只取 total，避免拉全表 */
export async function countErrorReportsSince(isoTimestamp: string): Promise<number> {
  const { count } = await fetchTableSelectRaw("error_reports", {
    select: "*",
    count: "exact",
    limit: "0",
    created_at: `gte.${isoTimestamp}`,
  });
  return Number(count) || 0;
}

const DEFAULT_LIST_LIMIT = 100;

export async function listErrorReports(limit = DEFAULT_LIST_LIMIT): Promise<ErrorReportRow[]> {
  const qs = new URLSearchParams({
    select: "*",
    order: "created_at.desc",
    limit: String(limit),
  });
  const rows = await dataTableApi.get<unknown>("error_reports", qs.toString());
  return normalizeErrorReportRows(rows);
}

export async function deleteErrorReport(id: string): Promise<void> {
  await dataTableApi.del("error_reports", `id=eq.${encodeURIComponent(id)}`);
}

export async function deleteErrorReportsByIds(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const inList = ids.map((x) => encodeURIComponent(x)).join(",");
  await dataTableApi.del("error_reports", `id=in.(${inList})`);
}
