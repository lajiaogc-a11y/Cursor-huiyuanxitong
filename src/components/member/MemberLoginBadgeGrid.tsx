import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { MEMBER_LOGIN_BADGE_SLOT_COUNT, parseMemberLoginBadge } from "@/lib/memberLoginBadge";
import { normalizeLoginBadgesField } from "@/services/members/memberPortalSettingsService";

/**
 * 会员登录 / 注册 / 邀请页 6 格功能展示。
 * 文案与图标仅来自后台「会员系统」配置（login_badges），勿用本地 splash 缓存冒充真源。
 */
export function MemberLoginBadgeGrid({
  loginBadges,
  className,
  /** 等待 /api/member-portal-settings/* 返回前显示占位，避免先空后满造成闪跳 */
  loading = false,
}: {
  loginBadges: unknown;
  className?: string;
  loading?: boolean;
}) {
  const loginBadgeSlots = useMemo(() => {
    const lines = normalizeLoginBadgesField(loginBadges).slice(0, MEMBER_LOGIN_BADGE_SLOT_COUNT);
    return Array.from({ length: MEMBER_LOGIN_BADGE_SLOT_COUNT }, (_, i) => {
      try {
        return parseMemberLoginBadge(lines[i] ?? "");
      } catch {
        return { icon: "", label: String(lines[i] ?? "").trim() };
      }
    });
  }, [loginBadges]);

  if (loading) {
    return (
      <div
        className={cn("mb-6 grid grid-cols-3 gap-2.5 [grid-auto-rows:1fr]", className)}
        aria-busy
        aria-label="Loading"
      >
        {Array.from({ length: MEMBER_LOGIN_BADGE_SLOT_COUNT }, (_, idx) => (
          <div
            key={idx}
            className="flex h-full min-h-[5.75rem] flex-col items-stretch justify-center rounded-2xl border border-[hsl(var(--pu-m-surface-border)/0.12)] bg-[hsl(var(--pu-m-surface)/0.18)] p-3"
          >
            <div className="mx-auto mb-2 h-7 w-[40%] max-w-[3rem] animate-pulse rounded-md bg-[hsl(var(--pu-m-surface-border)/0.35)]" />
            <div className="mx-auto h-3 w-[72%] animate-pulse rounded bg-[hsl(var(--pu-m-surface-border)/0.28)]" />
            <div className="mx-auto mt-1.5 h-3 w-[55%] animate-pulse rounded bg-[hsl(var(--pu-m-surface-border)/0.2)]" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("mb-6 grid grid-cols-3 gap-2.5 [grid-auto-rows:1fr]", className)}>
      {loginBadgeSlots.map((slot, idx) => {
        const { icon, label } = slot;
        const isEmpty = !icon && !label;
        return (
          <div
            key={idx}
            className={cn(
              "flex h-full min-h-[5.75rem] flex-col items-stretch rounded-2xl p-3 text-center",
              isEmpty
                ? "border border-dashed border-[hsl(var(--pu-m-surface-border)/0.38)] bg-[hsl(var(--pu-m-surface)/0.12)]"
                : "border border-[hsl(var(--pu-m-surface-border)/0.2)] bg-[hsl(var(--pu-m-surface)/0.35)]",
            )}
          >
            <div className="flex min-h-[2.25rem] flex-shrink-0 items-center justify-center text-[1.35rem] leading-none">
              {icon ? (
                <span className="select-none" aria-hidden>
                  {icon}
                </span>
              ) : null}
            </div>
            <div className="flex min-h-0 flex-1 items-start justify-center text-[10px] font-medium leading-snug text-[hsl(var(--pu-m-text-dim))] break-words">
              {label}
            </div>
          </div>
        );
      })}
    </div>
  );
}
