import { apiClient } from "@/lib/apiClient";
import { normalizeCategoryRow, normalizeArticleRow } from "@/lib/knowledgeNormalizer";

export async function getKnowledgeCategories(tenantId?: string | null): Promise<unknown[]> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
  const res = await apiClient.get<unknown>(`/api/knowledge/categories${q}`);
  const raw = res as Record<string, unknown>;
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
  return (arr as Record<string, unknown>[]).map((r) => normalizeCategoryRow(r)) as unknown[];
}

export async function getKnowledgeArticles(categoryId: string, tenantId?: string | null): Promise<unknown[]> {
  const params = new URLSearchParams();
  if (tenantId) params.set("tenant_id", tenantId);
  const q = params.toString();
  const res = await apiClient.get<unknown>(
    `/api/knowledge/articles/${encodeURIComponent(categoryId)}${q ? `?${q}` : ""}`,
  );
  const raw = res as Record<string, unknown>;
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
  return (arr as Record<string, unknown>[]).map((r) => normalizeArticleRow(r)) as unknown[];
}

export interface KnowledgeCategoryPayload {
  name?: string;
  content_type?: "text" | "phrase" | "image";
  sort_order?: number;
  visibility?: "public" | "private";
  is_active?: boolean;
  created_by?: string | null;
  tenant_id?: string | null;
}

export interface KnowledgeArticlePayload {
  category_id?: string;
  title_zh?: string;
  title_en?: string | null;
  content?: string | null;
  description?: string | null;
  image_url?: string | null;
  sort_order?: number;
  is_published?: boolean;
  visibility?: "public" | "private";
  tenant_id?: string | null;
}

export async function createKnowledgeCategory(
  payload: KnowledgeCategoryPayload,
): Promise<Record<string, unknown> | null> {
  const res = await apiClient.post<unknown>("/api/data/knowledge/categories", payload);
  const raw = res as Record<string, unknown>;
  const data = raw?.data && typeof raw.data === "object" ? (raw.data as Record<string, unknown>) : raw;
  return data && typeof data === "object" ? data : null;
}

export async function updateKnowledgeCategory(
  id: string,
  payload: KnowledgeCategoryPayload,
): Promise<Record<string, unknown> | null> {
  const res = await apiClient.patch<unknown>(`/api/data/knowledge/categories/${encodeURIComponent(id)}`, payload);
  if (res == null || typeof res !== "object" || Array.isArray(res)) return null;
  const raw = res as Record<string, unknown>;
  // apiClient 成功时已解包为 data 本体；兼容仍带 { data } 的旧形态
  const inner = raw.data;
  const data =
    inner != null && typeof inner === "object" && !Array.isArray(inner)
      ? (inner as Record<string, unknown>)
      : raw;
  return data;
}

export async function deleteKnowledgeCategory(id: string, tenantId?: string | null): Promise<boolean> {
  const res = await apiClient.delete<{ success?: boolean }>(
    `/api/data/knowledge/categories/${encodeURIComponent(id)}`,
    tenantId ? { tenant_id: tenantId } : undefined,
  );
  return !!(res && typeof res === "object" && (res as { success?: boolean }).success !== false);
}

export async function createKnowledgeArticle(
  payload: KnowledgeArticlePayload,
): Promise<Record<string, unknown> | null> {
  const res = await apiClient.post<unknown>("/api/data/knowledge/articles", payload);
  const raw = res as Record<string, unknown>;
  const data = raw?.data && typeof raw.data === "object" ? (raw.data as Record<string, unknown>) : raw;
  return data && typeof data === "object" ? data : null;
}

export async function updateKnowledgeArticle(
  id: string,
  payload: KnowledgeArticlePayload,
): Promise<Record<string, unknown> | null> {
  const res = await apiClient.patch<unknown>(`/api/data/knowledge/articles/${encodeURIComponent(id)}`, payload);
  const raw = res as Record<string, unknown>;
  const data = raw?.data && typeof raw.data === "object" ? (raw.data as Record<string, unknown>) : raw;
  return data && typeof data === "object" ? data : null;
}

export async function deleteKnowledgeArticle(id: string, tenantId?: string | null): Promise<boolean> {
  const res = await apiClient.delete<{ success?: boolean }>(
    `/api/data/knowledge/articles/${encodeURIComponent(id)}`,
    tenantId ? { tenant_id: tenantId } : undefined,
  );
  return !!(res && typeof res === "object" && (res as { success?: boolean }).success !== false);
}

export async function getKnowledgeReadStatus(): Promise<string[]> {
  const res = await apiClient.get<unknown>("/api/data/knowledge/read-status");
  const raw = res as Record<string, unknown> | unknown[];
  const arr = Array.isArray(raw) ? raw : Array.isArray((raw as Record<string, unknown>)?.data)
    ? (raw as Record<string, unknown>).data as unknown[]
    : [];
  return (arr as unknown[]).map((id) => String(id));
}

export async function getKnowledgeUnreadCount(
  tenantId?: string | null,
): Promise<{ unreadCount: number; unreadByCategory: Record<string, number> }> {
  const q = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
  const res = await apiClient.get<unknown>(`/api/data/knowledge/unread-count${q}`);
  const raw = res as Record<string, unknown>;
  const data = raw?.data && typeof raw.data === "object" ? (raw.data as Record<string, unknown>) : raw;
  const unreadCount = Number(data?.unreadCount ?? 0) || 0;
  const rawMap = data?.unreadByCategory;
  const unreadByCategory: Record<string, number> = {};
  if (rawMap && typeof rawMap === "object" && !Array.isArray(rawMap)) {
    for (const [k, v] of Object.entries(rawMap as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n) && n > 0) unreadByCategory[k] = n;
    }
  }
  return { unreadCount, unreadByCategory };
}

export async function postKnowledgeMarkRead(articleId: string): Promise<boolean> {
  const res = await apiClient.post<{ success?: boolean }>("/api/data/knowledge/read-status", {
    article_id: articleId,
  });
  return !!(res && typeof res === "object" && (res as { success?: boolean }).success);
}

export async function postKnowledgeMarkAllRead(tenantId?: string | null): Promise<number> {
  const body = tenantId ? { tenant_id: tenantId } : {};
  const res = await apiClient.post<unknown>("/api/data/knowledge/read-status/mark-all", body);
  const raw = res as Record<string, unknown>;
  const data = raw?.data && typeof raw.data === "object" ? (raw.data as Record<string, unknown>) : raw;
  return Number(data?.count ?? 0) || 0;
}

export async function seedKnowledgeCategories(): Promise<{ seeded: boolean; count?: number; message?: string }> {
  const res = await apiClient.post<{ seeded?: boolean; count?: number; message?: string }>("/api/data/seed-knowledge");
  const raw = res as Record<string, unknown>;
  const data = raw?.data ?? raw;
  return data && typeof data === "object"
    ? (data as { seeded: boolean; count?: number; message?: string })
    : { seeded: false };
}
