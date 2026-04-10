/**
 * 引用列表数据规范化工具
 * 从 api/staffData/referenceLists 提取，供 service/api 共用。
 */

export function scalarToDisplayString(raw: unknown): string {
  if (raw == null || raw === "") return "";
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (Number.isInteger(raw)) return String(raw);
    const t = String(raw);
    if (!/[eE]/.test(t)) return t;
    const fixed = raw.toFixed(12).replace(/\.?0+$/, "");
    return fixed === "-0" ? "0" : fixed;
  }
  const s = String(raw).trim();
  if (!s || s === "null" || s === "undefined") return "";
  if (/^\d+\.?\d*[eE][+-]?\d+$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) {
      const fixed = n.toFixed(12).replace(/\.?0+$/, "");
      return fixed === "-0" ? "0" : fixed;
    }
  }
  return s;
}

export function isJunkActivityTypeLabel(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (/^[eE]$/.test(t)) return true;
  if (/^\d+\.?\d*[eE][+-]?\d+$/.test(t)) return true;
  return false;
}

export function pickActivityTypeLabel(row: Record<string, unknown>): string {
  const keys = ["label", "name", "value", "code"] as const;
  for (const key of keys) {
    const s = scalarToDisplayString(row[key]);
    if (s && !isJunkActivityTypeLabel(s)) return s;
  }
  return "";
}

export function parseActivityTypeActive(raw: unknown): boolean {
  if (raw === true || raw === 1) return true;
  if (raw === false || raw === 0) return false;
  if (typeof raw === "string") {
    const low = raw.trim().toLowerCase();
    if (low === "1" || low === "true" || low === "yes") return true;
    if (low === "0" || low === "false" || low === "no") return false;
  }
  return true;
}
