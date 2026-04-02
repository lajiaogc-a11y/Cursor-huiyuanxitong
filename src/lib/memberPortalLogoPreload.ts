import { resolveMemberMediaUrl } from "@/lib/memberMediaUrl";

/** 预解码门户 Logo，减少首屏从占位图标切到图片的闪烁 */
export function preloadMemberPortalLogo(raw: string | null | undefined): Promise<void> {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) return Promise.resolve();
  const url = resolveMemberMediaUrl(raw);
  if (!url) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = url;
  });
}
