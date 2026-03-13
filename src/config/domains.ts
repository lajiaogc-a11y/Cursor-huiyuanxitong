/**
 * 域名配置 - 会员端与员工端分离
 * 主域名 crm.fastgc.cc → 会员登录/会员端
 * 员工后台 admin.crm.fastgc.cc → 员工登录/管理端
 */

/** 员工后台二级域名 */
export const ADMIN_SUBDOMAIN = "admin.crm.fastgc.cc";

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
