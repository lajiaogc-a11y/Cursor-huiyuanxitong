/**
 * Knowledge 数据规范化工具
 * 从 api/staffData/knowledge.ts 提取，集中管理 visibility / content_type 映射规则。
 */

const CONTENT_TYPES = new Set(["text", "phrase", "image"]);

export function normalizeCategoryRow(row: Record<string, unknown>): Record<string, unknown> {
  const ct = String(row.content_type ?? "text").toLowerCase();
  const visRaw = String(row.visibility ?? "public").toLowerCase().trim();
  const visibility = visRaw === "private" ? "private" : "public";
  return {
    ...row,
    content_type: CONTENT_TYPES.has(ct) ? ct : "text",
    visibility,
  };
}

export function normalizeArticleRow(row: Record<string, unknown>): Record<string, unknown> {
  const visRaw = String(row.visibility ?? "public").toLowerCase().trim();
  const visibility = visRaw === "private" ? "private" : "public";
  return { ...row, visibility };
}
