/**
 * 按访问域名拆分会员端与员工端 SPA（生产环境隔离入口，本地开发默认可同时访问两套路由）。
 * 方案 D：构建时通过 VITE_MEMBER_HOSTS / VITE_STAFF_HOSTS（逗号分隔）覆盖，未设置则使用下列默认。
 */
function parseHostCsv(raw: string | undefined, fallbacks: readonly string[]): string[] {
  const t = (raw ?? "").trim();
  if (!t) return [...fallbacks];
  return t.split(",").map((s) => s.trim()).filter(Boolean);
}

/** 与 public/theme-init.js MEMBER_HOSTS 保持同步；含 www 避免移动收藏夹/跳转打不开会员模式 */
const DEFAULT_MEMBER = ["crm.fastgc.cc", "www.crm.fastgc.cc"] as const;
const DEFAULT_STAFF = ["admin.crm.fastgc.cc"] as const;

export const MEMBER_HOSTS = parseHostCsv(import.meta.env.VITE_MEMBER_HOSTS, DEFAULT_MEMBER);
export const STAFF_HOSTS = parseHostCsv(import.meta.env.VITE_STAFF_HOSTS, DEFAULT_STAFF);

export type SiteMode = "member" | "staff" | "both";

export function getSiteMode(): SiteMode {
  if (typeof window === "undefined") return "both";
  const host = window.location.hostname.toLowerCase();
  if (MEMBER_HOSTS.some((h) => h.toLowerCase() === host)) return "member";
  if (STAFF_HOSTS.some((h) => h.toLowerCase() === host)) return "staff";
  return "both";
}

/** 构建时打包进客户端 bundle，与首屏 hostname 一致 */
export const SITE_MODE = getSiteMode();

export const showMemberPortal = SITE_MODE === "member" || SITE_MODE === "both";
export const showStaffPortal = SITE_MODE === "staff" || SITE_MODE === "both";
