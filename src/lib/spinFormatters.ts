export type PortalT = (zh: string, en: string) => string;

export function formatSpinSource(raw: string | null | undefined, t: PortalT): string {
  if (raw == null || String(raw).trim() === "") return "-";
  const key = String(raw).trim().toLowerCase().replace(/\s+/g, "_");
  const pairs: Record<string, [string, string]> = {
    daily_free: ["每日免费", "Daily free"],
    member_portal: ["会员端", "Member portal"],
    share: ["分享奖励", "Share reward"],
    share_reward: ["分享奖励", "Share reward"],
    invite: ["邀请", "Invite"],
    referral: ["推荐关系", "Referral"],
    invite_welcome: ["邀请欢迎礼", "Invite welcome"],
    check_in: ["每日签到", "Check-in"],
    checkin: ["每日签到", "Check-in"],
    spin: ["幸运转盘", "Spin wheel"],
    wheel: ["幸运转盘", "Spin wheel"],
    activity: ["活动", "Activity"],
    admin: ["后台发放", "Admin"],
    points: ["积分兑换", "Points"],
    purchase: ["购买/兑换", "Purchase"],
    task: ["任务", "Task"],
    bonus: ["奖励", "Bonus"],
  };
  const p = pairs[key];
  return p ? t(p[0], p[1]) : raw;
}

export function formatSpinStatus(raw: string | null | undefined, t: PortalT): string {
  if (raw == null || String(raw).trim() === "") return t("未知", "Unknown");
  const key = String(raw).trim().toLowerCase();
  const pairs: Record<string, [string, string]> = {
    issued: ["已发放", "Issued"],
    pending: ["待发放", "Pending"],
    processing: ["处理中", "Processing"],
    cancelled: ["已取消", "Cancelled"],
    canceled: ["已取消", "Cancelled"],
    failed: ["失败", "Failed"],
    expired: ["已过期", "Expired"],
    revoked: ["已撤回", "Revoked"],
  };
  const p = pairs[key];
  return p ? t(p[0], p[1]) : raw;
}

export function spinStatusBadgeVariant(status: string | null | undefined): "default" | "secondary" | "destructive" | "outline" {
  const k = String(status || "").toLowerCase();
  if (k === "issued") return "default";
  if (k === "pending" || k === "processing") return "secondary";
  if (k === "failed" || k === "cancelled" || k === "canceled" || k === "revoked" || k === "expired") return "destructive";
  return "outline";
}
