import type { PortalT } from "@/lib/spinFormatters";

export const ACTION_MAP: Record<string, { zh: string; en: string; color: string }> = {
  spin: { zh: "幸运抽奖", en: "Spin", color: "bg-purple-500 text-white" },
  login: { zh: "登录", en: "Login", color: "bg-blue-500 text-white" },
  register: { zh: "注册", en: "Register", color: "bg-green-500 text-white" },
  register_via_invite: { zh: "邀请注册", en: "Invite Register", color: "bg-emerald-500 text-white" },
  check_in: { zh: "每日签到", en: "Check-in", color: "bg-amber-500 text-white" },
  checkin: { zh: "每日签到", en: "Check-in", color: "bg-amber-500 text-white" },
  share: { zh: "分享", en: "Share", color: "bg-cyan-500 text-white" },
  redeem: { zh: "积分兑换", en: "Redeem", color: "bg-orange-500 text-white" },
  invite: { zh: "邀请好友", en: "Invite", color: "bg-teal-500 text-white" },
  profile_update: { zh: "资料更新", en: "Profile Update", color: "bg-indigo-500 text-white" },
  password_change: { zh: "修改密码", en: "Password Change", color: "bg-rose-500 text-white" },
  order: { zh: "下单", en: "Order", color: "bg-sky-500 text-white" },
  view_product: { zh: "浏览商品", en: "View Product", color: "bg-slate-500 text-white" },
  logout: { zh: "退出登录", en: "Logout", color: "bg-gray-500 text-white" },
};

export function getActionLabel(action: string, t: PortalT): string {
  const m = ACTION_MAP[action];
  return m ? t(m.zh, m.en) : action;
}

export function getActionBadgeClass(action: string): string {
  return ACTION_MAP[action]?.color || "bg-gray-400 text-white";
}
