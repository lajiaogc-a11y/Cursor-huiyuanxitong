/**
 * 会员端图片 URL：后台上传返回常为 `/api/upload/image/:id`。
 * 静态页与 API 不同源时须配置 VITE_API_BASE，否则相对路径会打到无 /api 反代的静态站导致 404。
 */
import { getApiBaseUrl } from "@/lib/apiBase";

export function resolveMemberMediaUrl(raw: string | null | undefined): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return "";
  if (s.startsWith("data:") || s.startsWith("blob:")) return s;
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) {
    return typeof window !== "undefined" ? `${window.location.protocol}${s}` : `https:${s}`;
  }
  const base = getApiBaseUrl();
  if (s.startsWith("/")) {
    return base ? `${base}${s}` : s;
  }
  if (s.startsWith("api/")) {
    return base ? `${base}/${s}` : s;
  }
  return s;
}

/**
 * Legacy img onError: one retry after 2s, then display:none.
 * 新代码请用 useMemberResolvableMedia / ResolvableMediaThumb，避免隐藏后留白。
 */
export function handleImgError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  const retried = img.dataset.retried;
  if (!retried && img.src) {
    img.dataset.retried = "1";
    const original = img.src;
    img.src = "";
    setTimeout(() => { img.src = original; }, 2000);
    return;
  }
  img.style.display = "none";
}
