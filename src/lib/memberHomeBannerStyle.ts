/** 首页轮播：后台下发的图片布局样式（归一化 + 安全过滤） */

export type HomeBannerLayout = "split" | "full_image";

export type HomeBannerImageFit = "cover" | "contain" | "fill" | "none" | "scale-down";

const ALLOWED_FIT = new Set<HomeBannerImageFit>(["cover", "contain", "fill", "none", "scale-down"]);

export function normalizeHomeBannerLayout(v: unknown): HomeBannerLayout {
  return v === "full_image" ? "full_image" : "split";
}

export function normalizeHomeBannerImageFit(v: unknown): HomeBannerImageFit {
  const x = String(v ?? "cover").trim().toLowerCase() as HomeBannerImageFit;
  return ALLOWED_FIT.has(x) ? x : "cover";
}

/** object-position：仅允许安全字符，防注入 */
export function sanitizeHomeBannerObjectPosition(v: unknown): string {
  const s = String(v ?? "center").trim().slice(0, 48);
  if (!/^[\w\s%,.+-]+$/.test(s)) return "center";
  return s;
}
