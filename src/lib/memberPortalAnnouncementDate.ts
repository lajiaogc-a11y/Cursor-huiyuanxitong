/** 会员端 / 后台预览：公告 `published_at`（YYYY-MM-DD 或 ISO）展示为短日期 */
export function formatAnnouncementPublishedAt(
  raw: string | null | undefined,
  locale: "zh" | "en",
): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T12:00:00` : s;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
