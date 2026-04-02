/**
 * Shared utilities for MemberPortalSettings tabs
 * Extracted from MemberPortalSettings.tsx to reduce file size and improve reusability
 */
import { cn } from "@/lib/utils";
import React from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, Inbox } from "lucide-react";

// ─── Type Aliases ────────────────────────────────────────────────────────────
export type PortalT = (zh: string, en: string) => string;

// ─── Date Range ──────────────────────────────────────────────────────────────
export const DATE_RANGES = [
  { key: "all",   zh: "全部",   en: "All" },
  { key: "today", zh: "今天",   en: "Today" },
  { key: "7d",    zh: "近7天",  en: "7 Days" },
  { key: "30d",   zh: "近30天", en: "30 Days" },
] as const;
export type DateRangeKey = (typeof DATE_RANGES)[number]["key"];

export function getDateRangeSql(range: DateRangeKey): string | undefined {
  if (range === "all") return undefined;
  const SHANGHAI = "Asia/Shanghai";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? "";
  if (range === "today") {
    return `${get("year")}-${get("month")}-${get("day")} 00:00:00`;
  }
  const days = range === "7d" ? 7 : 30;
  const d = new Date(Date.now() - days * 86400000);
  const dp = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const dg = (t: Intl.DateTimeFormatPartTypes) => dp.find((p) => p.type === t)?.value ?? "";
  return `${dg("year")}-${dg("month")}-${dg("day")} 00:00:00`;
}

// ─── Spin formatters ─────────────────────────────────────────────────────────
export function formatSpinSource(raw: string | null | undefined, t: PortalT): string {
  if (raw == null || String(raw).trim() === "") return "-";
  const key = String(raw).trim().toLowerCase().replace(/\s+/g, "_");
  const pairs: Record<string, [string, string]> = {
    daily_free:      ["每日免费",   "Daily free"],
    member_portal:   ["会员端",     "Member portal"],
    share:           ["分享奖励",   "Share reward"],
    share_reward:    ["分享奖励",   "Share reward"],
    invite:          ["邀请",       "Invite"],
    referral:        ["推荐关系",   "Referral"],
    invite_welcome:  ["邀请欢迎礼", "Invite welcome"],
    check_in:        ["每日签到",   "Check-in"],
    checkin:         ["每日签到",   "Check-in"],
    spin:            ["幸运转盘",   "Spin wheel"],
    wheel:           ["幸运转盘",   "Spin wheel"],
    activity:        ["活动",       "Activity"],
    admin:           ["后台发放",   "Admin"],
    points:          ["积分兑换",   "Points"],
    purchase:        ["购买/兑换",  "Purchase"],
    task:            ["任务",       "Task"],
    bonus:           ["奖励",       "Bonus"],
  };
  const p = pairs[key];
  return p ? t(p[0], p[1]) : raw;
}

export function formatSpinStatus(raw: string | null | undefined, t: PortalT): string {
  if (raw == null || String(raw).trim() === "") return t("未知", "Unknown");
  const key = String(raw).trim().toLowerCase();
  const pairs: Record<string, [string, string]> = {
    issued:     ["已发放", "Issued"],
    pending:    ["待发放", "Pending"],
    processing: ["处理中", "Processing"],
    cancelled:  ["已取消", "Cancelled"],
    canceled:   ["已取消", "Cancelled"],
    failed:     ["失败",   "Failed"],
    expired:    ["已过期", "Expired"],
    revoked:    ["已撤回", "Revoked"],
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

// ─── Operation Log formatters ────────────────────────────────────────────────
export const ACTION_MAP: Record<string, { zh: string; en: string; color: string }> = {
  spin:                { zh: "幸运抽奖",   en: "Spin",            color: "bg-purple-500 text-white" },
  login:               { zh: "登录",       en: "Login",           color: "bg-blue-500 text-white" },
  register:            { zh: "注册",       en: "Register",        color: "bg-green-500 text-white" },
  register_via_invite: { zh: "邀请注册",   en: "Invite Register", color: "bg-emerald-500 text-white" },
  check_in:            { zh: "每日签到",   en: "Check-in",        color: "bg-amber-500 text-white" },
  checkin:             { zh: "每日签到",   en: "Check-in",        color: "bg-amber-500 text-white" },
  share:               { zh: "分享",       en: "Share",           color: "bg-cyan-500 text-white" },
  redeem:              { zh: "积分兑换",   en: "Redeem",          color: "bg-orange-500 text-white" },
  invite:              { zh: "邀请好友",   en: "Invite",          color: "bg-teal-500 text-white" },
  profile_update:      { zh: "资料更新",   en: "Profile Update",  color: "bg-indigo-500 text-white" },
  password_change:     { zh: "修改密码",   en: "Password Change", color: "bg-rose-500 text-white" },
  order:               { zh: "下单",       en: "Order",           color: "bg-sky-500 text-white" },
  view_product:        { zh: "浏览商品",   en: "View Product",    color: "bg-slate-500 text-white" },
  logout:              { zh: "退出登录",   en: "Logout",          color: "bg-gray-500 text-white" },
};

export function getActionLabel(action: string, t: PortalT): string {
  const m = ACTION_MAP[action];
  return m ? t(m.zh, m.en) : action;
}

export function getActionBadgeClass(action: string): string {
  return ACTION_MAP[action]?.color || "bg-gray-400 text-white";
}

// ─── Shared UI sub-components ────────────────────────────────────────────────
export function PaginationBar({ page, totalPages, total, pageSize, onPageChange, t }: {
  page: number; totalPages: number; total: number; pageSize: number;
  onPageChange: (p: number) => void; t: PortalT;
}) {
  const startItem = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, total);

  const getVisiblePages = (): (number | "...")[] => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="flex items-center justify-between flex-wrap gap-2 pt-2">
      <span className="text-xs text-muted-foreground">
        {t(`显示 ${startItem}-${endItem}，共 ${total} 条`, `Showing ${startItem}-${endItem} of ${total}`)}
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronDown className="h-3.5 w-3.5 rotate-90" />
        </Button>
        {getVisiblePages().map((p, i) =>
          p === "..." ? (
            <span key={`dot-${i}`} className="px-1 text-xs text-muted-foreground">...</span>
          ) : (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              size="sm"
              className={cn("h-7 w-7 p-0 text-xs", p === page && "pointer-events-none")}
              onClick={() => onPageChange(p as number)}
            >
              {p}
            </Button>
          )
        )}
        <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
        </Button>
      </div>
    </div>
  );
}

export function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className={cn("rounded-lg border p-3 flex items-start gap-3 min-w-0", color)}>
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground leading-tight">{label}</p>
        <p className="text-lg font-bold leading-tight mt-0.5">{value}</p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

/** 会员门户设置内日志 / 空列表外壳（与 PortalSettingsEmptyState 同一套 muted 虚线面） */
export const portalSettingsEmptyShellClass =
  "relative overflow-hidden rounded-xl border border-dashed border-border/50 bg-muted/35 px-4 py-8 text-center";

export const portalSettingsEmptyIconWrapClass =
  "inline-flex h-11 w-11 items-center justify-center rounded-xl border border-border/40 bg-muted/60 text-muted-foreground";

/** 会员门户设置内日志类 Tab 的空列表；不影响全局 MobileEmptyState。 */
export function MemberPortalLogsEmpty({ message }: { message: string }) {
  return (
    <div className={cn(portalSettingsEmptyShellClass, "py-10")}>
      <div className="relative flex flex-col items-center gap-3">
        <div className={cn(portalSettingsEmptyIconWrapClass, "h-12 w-12")}>
          <Inbox className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </div>
        <p className="text-sm font-medium text-foreground">{message}</p>
      </div>
    </div>
  );
}
