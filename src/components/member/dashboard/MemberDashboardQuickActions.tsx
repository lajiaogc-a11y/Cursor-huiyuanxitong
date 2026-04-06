import { Link, useNavigate } from "react-router-dom";
import { Gift, Star, Users, Wallet, Sparkles, ChevronRight } from "lucide-react";
import { ROUTES } from "@/routes/constants";
import { stashPointsHashBeforeInviteNavigation } from "@/lib/memberPortalInviteReturn";
import { notifyInfo } from "@/utils/notify";

export interface MemberDashboardQuickActionsProps {
  t: (zh: string, en: string) => string;
  showSpin: boolean;
  showInvite: boolean;
  spinRemaining: number;
  spinError: unknown;
}

export function MemberDashboardQuickActions({
  t,
  showSpin,
  showInvite,
  spinRemaining,
  spinError,
}: MemberDashboardQuickActionsProps) {
  const navigate = useNavigate();

  return (
    <>
      <div className="-mt-2 mb-7 px-5">
        <div className="grid grid-cols-4 gap-3">
          <Link
            to={ROUTES.MEMBER.POINTS}
            className="group flex flex-col items-center gap-2 rounded-2xl p-3 no-underline member-transition-surface member-motion-base"
          >
            <div
              className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-pu-gold to-pu-gold-deep transition-transform member-motion-base group-hover:scale-105 motion-reduce:group-hover:scale-100"
              style={{ boxShadow: "0 6px 20px -6px hsl(var(--pu-m-surface-border) / 0.4)" }}
            >
              <Gift className="h-[22px] w-[22px] text-[hsl(var(--pu-primary-foreground))]" strokeWidth={2} aria-hidden />
            </div>
            <span className="text-center text-[11px] font-bold text-[hsl(var(--pu-m-text-dim))] member-transition-color member-motion-fast group-hover:text-[hsl(var(--pu-m-text))]">
              {t("积分商城", "Points mall")}
            </span>
          </Link>
          {showSpin ? (
            <Link
              to={ROUTES.MEMBER.SPIN}
              className="group flex flex-col items-center gap-2 rounded-2xl p-3 no-underline member-transition-surface member-motion-base"
              aria-label={t("进入幸运抽奖", "Go to lucky draw")}
            >
              <div
                className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-pu-rose to-pu-rose-soft transition-transform member-motion-base group-hover:scale-105 motion-reduce:group-hover:scale-100"
                style={{ boxShadow: "0 6px 20px -6px hsl(var(--pu-m-surface-border) / 0.4)" }}
              >
                <Star className="h-[22px] w-[22px] text-[hsl(var(--pu-m-bg-1))]" strokeWidth={2} aria-hidden />
              </div>
              <span className="text-center text-[11px] font-bold text-[hsl(var(--pu-m-text-dim))] member-transition-color member-motion-fast group-hover:text-[hsl(var(--pu-m-text))]">
                {t("幸运抽奖", "Lucky spin")}
              </span>
            </Link>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-2xl p-3 opacity-40" aria-hidden>
              <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-pu-rose/30 to-pu-rose-soft/20">
                <Star className="h-[22px] w-[22px] text-[hsl(var(--pu-m-bg-1)/0.55)]" strokeWidth={2} aria-hidden />
              </div>
              <span className="text-center text-[11px] font-bold text-[hsl(var(--pu-m-text-dim))]">{t("幸运抽奖", "Lucky spin")}</span>
            </div>
          )}
          {showInvite ? (
            <Link
              to={ROUTES.MEMBER.INVITE}
              onClick={() => stashPointsHashBeforeInviteNavigation(window.location.pathname, window.location.hash)}
              className="group flex flex-col items-center gap-2 rounded-2xl p-3 no-underline member-transition-surface member-motion-base"
            >
              <div className="relative">
                <div
                  className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-pu-emerald to-pu-emerald-soft transition-transform member-motion-base group-hover:scale-105 motion-reduce:group-hover:scale-100"
                  style={{ boxShadow: "0 6px 20px -6px hsl(var(--pu-m-surface-border) / 0.4)" }}
                >
                  <Users className="h-[22px] w-[22px] text-[hsl(var(--pu-m-bg-1))]" strokeWidth={2} aria-hidden />
                </div>
              </div>
              <span className="text-center text-[11px] font-bold text-[hsl(var(--pu-m-text-dim))] member-transition-color member-motion-fast group-hover:text-[hsl(var(--pu-m-text))]">
                {t("邀请好友", "Invite")}
              </span>
            </Link>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-2xl p-3 opacity-40" aria-hidden>
              <div className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-pu-emerald/30 to-pu-emerald-soft/20">
                <Users className="h-[22px] w-[22px] text-[hsl(var(--pu-m-bg-1)/0.55)]" strokeWidth={2} aria-hidden />
              </div>
              <span className="text-center text-[11px] font-bold text-[hsl(var(--pu-m-text-dim))]">{t("邀请好友", "Invite")}</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => notifyInfo(t("维护中", "Under maintenance"))}
            className="group flex cursor-pointer flex-col items-center gap-2 rounded-2xl p-3 text-left member-transition-surface member-motion-base motion-reduce:transition-none active:scale-[0.96] motion-reduce:active:scale-100"
            aria-label={t("我的钱包（维护中）", "Wallet (under maintenance)")}
          >
            <div
              className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-pu-silver to-pu-silver-soft transition-transform member-motion-base group-hover:scale-105 motion-reduce:group-hover:scale-100"
              style={{ boxShadow: "0 6px 20px -6px hsl(var(--pu-m-surface-border) / 0.4)" }}
            >
              <Wallet className="h-[22px] w-[22px] text-[hsl(var(--pu-m-bg-1))]" strokeWidth={2} aria-hidden />
            </div>
            <span className="text-center text-[11px] font-bold text-[hsl(var(--pu-m-text-dim))] member-transition-color member-motion-fast group-hover:text-[hsl(var(--pu-m-text))]">
              {t("我的钱包", "Wallet")}
            </span>
          </button>
        </div>
      </div>

      {showSpin ? (
        <div className="mb-6 px-5">
          <button
            type="button"
            onClick={() => navigate(ROUTES.MEMBER.SPIN)}
            aria-label={t("进入幸运抽奖", "Go to lucky draw")}
            className="relative flex w-full items-center justify-between overflow-hidden rounded-[1.25rem] border border-[hsl(var(--pu-gold)/0.15)] p-4 text-left m-glass"
          >
            <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-r from-pu-gold/[0.05] to-pu-rose/[0.03]" />
            <div className="relative flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-pu-rose to-pu-rose-soft shadow-pu-glow-rose">
                <Sparkles className="h-5 w-5 text-[hsl(var(--pu-m-bg-1))]" aria-hidden />
              </div>
              <div>
                <div className="font-bold text-pu-rose-soft">{t("幸运抽奖", "Lucky spin")}</div>
                <div className="text-[11px] font-medium text-[hsl(var(--pu-m-text-dim))]">
                  {spinError ? "—" : t(`剩余 ${spinRemaining} 次抽奖机会`, `${spinRemaining} spins remaining`)}
                </div>
              </div>
            </div>
            <ChevronRight className="relative h-5 w-5 text-[hsl(var(--pu-m-text-dim)/0.45)]" aria-hidden />
          </button>
        </div>
      ) : null}
    </>
  );
}
