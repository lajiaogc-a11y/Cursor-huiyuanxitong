/**
 * 会员域名与员工域名分离部署时，SPA 内 <Navigate> / navigate() 无法跨子域生效。
 * 在「当前 hostname 与目标门户不一致」时使用 location.replace 整页跳转。
 */
import { MEMBER_HOSTS, STAFF_HOSTS } from "@/routes/siteMode";

export function memberPortalOrigin(): string {
  if (typeof window === "undefined") return "";
  const host = MEMBER_HOSTS[0] || "crm.fastgc.cc";
  return `${window.location.protocol}//${host}`;
}

export function staffPortalOrigin(): string {
  if (typeof window === "undefined") return "";
  const host = STAFF_HOSTS[0] || "admin.crm.fastgc.cc";
  return `${window.location.protocol}//${host}`;
}

export function isOnMemberHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  return MEMBER_HOSTS.some((x) => x.toLowerCase() === h);
}

export function isOnStaffHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  return STAFF_HOSTS.some((x) => x.toLowerCase() === h);
}

/** 当前在员工专属域名上，需要打开会员端路径时 */
export function shouldHardRedirectToMemberPortal(): boolean {
  return typeof window !== "undefined" && isOnStaffHost();
}

/** 当前在会员专属域名上，需要打开员工端路径时 */
export function shouldHardRedirectToStaffPortal(): boolean {
  return typeof window !== "undefined" && isOnMemberHost();
}

export function hardRedirectToMember(path: string): void {
  const p = path.startsWith("/") ? path : `/${path}`;
  window.location.replace(`${memberPortalOrigin()}${p}`);
}

export function hardRedirectToStaff(path: string): void {
  const p = path.startsWith("/") ? path : `/${path}`;
  window.location.replace(`${staffPortalOrigin()}${p}`);
}
