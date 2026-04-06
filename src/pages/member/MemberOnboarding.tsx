/**
 * MemberOnboarding — premium-ui-boost 多步引导；文案 i18n，结束跳转会员首页。
 */
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronRight } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { ROUTES } from "@/routes/constants";
import { markMemberPostLoginShellTransition } from "@/lib/memberPostLoginTransition";
import { cn } from "@/lib/utils";
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";
import "@/styles/member-portal.css";

export default function MemberOnboarding() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [current, setCurrent] = useState(0);
  const touchStart = useRef(0);

  const steps = [
    {
      color: "--pu-gold" as const,
      titleZh: "积分商城",
      titleEn: "Points mall",
      descZh: "用积分兑换礼品与权益，好礼不停。",
      descEn: "Redeem rewards and perks with your points.",
      emoji: "🎁",
    },
    {
      color: "--pu-rose" as const,
      titleZh: "每日抽奖",
      titleEn: "Daily lucky draw",
      descZh: "完成任务获取转盘机会，惊喜奖品等你来。",
      descEn: "Earn spins from tasks — surprises await.",
      emoji: "🎯",
    },
    {
      color: "--pu-emerald" as const,
      titleZh: "邀请好友",
      titleEn: "Invite friends",
      descZh: "邀请好友注册，双方均可获得奖励。",
      descEn: "Invite friends — rewards for both sides.",
      emoji: "👥",
    },
    {
      color: "--pu-gold" as const,
      titleZh: "会员钱包",
      titleEn: "Member wallet",
      descZh: "余额与资产集中管理，充值提现即将开放。",
      descEn: "Manage balance in one place — funding features coming.",
      emoji: "💰",
    },
  ];

  const step = steps[current];
  const isLast = current === steps.length - 1;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStart.current;
    if (Math.abs(dx) < 40) return;
    if (dx < 0 && current < steps.length - 1) setCurrent((c) => c + 1);
    if (dx > 0 && current > 0) setCurrent((c) => c - 1);
  };

  const goDash = () => {
    markMemberPostLoginShellTransition();
    navigate(ROUTES.MEMBER.DASHBOARD);
  };

  return (
    <div
      className="relative flex min-h-dvh flex-col overflow-hidden"
      style={{ background: "hsl(var(--pu-m-bg-1))", color: "hsl(var(--pu-m-text))" }}
    >
      <MemberPageAmbientOrbs />
      <div className="relative z-[1] flex justify-end px-5 pt-5">
        <button
          type="button"
          onClick={goDash}
          className="text-[11px] font-bold text-[hsl(var(--pu-m-text-dim))] transition motion-reduce:transition-none hover:text-[hsl(var(--pu-m-text))]"
        >
          {t("跳过", "Skip")}
        </button>
      </div>

      <div
        className="relative z-[1] flex flex-1 flex-col items-center justify-center px-8"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="relative mb-8">
          <div
            key={current}
            className="flex h-24 w-24 animate-fade-in motion-reduce:animate-none items-center justify-center rounded-3xl"
            style={{
              background: `linear-gradient(135deg, hsl(var(${step.color}) / 0.12), hsl(var(${step.color}) / 0.04))`,
              border: `1px solid hsl(var(${step.color}) / 0.15)`,
              boxShadow: `0 0 40px -8px hsl(var(${step.color}) / 0.3)`,
            }}
          >
            <span className="text-4xl" aria-hidden>
              {step.emoji}
            </span>
          </div>
          <div className="pointer-events-none absolute -inset-3 animate-pulse motion-reduce:animate-none rounded-[28px] border border-[hsl(var(--pu-m-surface-border)/0.1)]" aria-hidden />
        </div>

        <div key={`text-${current}`} className="animate-fade-in motion-reduce:animate-none text-center">
          <h1 className="mb-3 text-2xl font-extrabold tracking-tight">{t(step.titleZh, step.titleEn)}</h1>
          <p className="mx-auto max-w-[280px] text-sm leading-relaxed text-[hsl(var(--pu-m-text-dim))]">
            {t(step.descZh, step.descEn)}
          </p>
        </div>
      </div>

      <div className="relative z-[1] px-6 pb-10">
        <div className="mb-6 flex items-center justify-center gap-2">
          {steps.map((_, i) => (
            <div
              key={i}
              className="h-1.5 rounded-full transition-all duration-300 motion-reduce:transition-none"
              style={{
                width: i === current ? 24 : 8,
                background:
                  i === current ? `hsl(var(${steps[current].color}))` : "hsl(var(--pu-m-surface-border) / 0.3)",
              }}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => {
            if (isLast) goDash();
            else setCurrent((c) => c + 1);
          }}
          className={cn(
            "btn-glow member-onboarding-cta flex w-full items-center justify-center gap-2 rounded-2xl border-0 py-4 text-sm motion-reduce:transition-none",
            isLast && "member-onboarding-cta--final",
          )}
        >
          {isLast ? t("开始使用", "Get started") : t("下一步", "Next")}
          {isLast ? <ChevronRight className="h-4 w-4" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
        </button>
      </div>
    </div>
  );
}
