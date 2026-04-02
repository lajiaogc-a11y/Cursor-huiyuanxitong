/**
 * 域名配置 - 会员端与员工端分离（与 siteMode / VITE_STAFF_HOSTS 一致）
 */
import { STAFF_HOSTS } from "@/routes/siteMode";

/** 员工后台 hostname（取配置列表首项，默认 admin.crm.fastgc.cc） */
export const ADMIN_SUBDOMAIN = STAFF_HOSTS[0] || "admin.crm.fastgc.cc";

/** 员工后台完整 URL（含协议） */
export const getAdminBaseUrl = () =>
  typeof window !== "undefined"
    ? `${window.location.protocol}//${ADMIN_SUBDOMAIN}`
    : `https://${ADMIN_SUBDOMAIN}`;

/** 当前是否为员工后台域名（含 localhost 开发环境） */
export const isAdminDomain = (): boolean => {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  if (h === ADMIN_SUBDOMAIN) return true;
  if (h === "localhost" || h === "127.0.0.1") return true;
  return false;
};
