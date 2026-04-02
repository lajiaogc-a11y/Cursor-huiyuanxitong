import { resolveMemberMediaUrl } from "@/lib/memberMediaUrl";

const DATA_ATTR = "data-member-portal-favicon";

/** 按租户 Logo 更新标签页图标；登出 / 清门户缓存时须调用 {@link removeMemberPortalFaviconOverride} */
export function applyMemberPortalFaviconFromLogoRaw(raw: string | null | undefined): void {
  if (typeof document === "undefined") return;
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s) {
    removeMemberPortalFaviconOverride();
    return;
  }
  const href = resolveMemberMediaUrl(raw);
  if (!href) {
    removeMemberPortalFaviconOverride();
    return;
  }
  let link = document.querySelector<HTMLLinkElement>(`link[rel="icon"][${DATA_ATTR}="1"]`);
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.setAttribute(DATA_ATTR, "1");
    document.head.appendChild(link);
  }
  link.href = href;
}

export function removeMemberPortalFaviconOverride(): void {
  if (typeof document === "undefined") return;
  document.querySelectorAll(`link[${DATA_ATTR}="1"]`).forEach((el) => el.remove());
}
