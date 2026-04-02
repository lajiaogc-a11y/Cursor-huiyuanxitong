import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Gift, Sparkles, Users, Target, ArrowRight, ChevronRight } from "lucide-react";

const steps = [
  {
    icon: Gift,
    color: "--gold",
    title: "积分商城",
    desc: "用积分兑换礼品卡、订阅服务和现金奖励。海量好礼等你来换！",
    emoji: "🎁",
  },
  {
    icon: Target,
    color: "--rose",
    title: "每日抽奖",
    desc: "每天免费抽奖，赢取积分、礼品卡和额外抽奖机会。",
    emoji: "🎯",
  },
  {
    icon: Users,
    color: "--emerald",
    title: "邀请好友",
    desc: "邀请好友注册，双方各得 10 次免费抽奖机会。人脉就是财富！",
    emoji: "👥",
  },
  {
    icon: Sparkles,
    color: "--gold",
    title: "会员钱包",
    desc: "安全管理您的资产余额，随时充值、提现，一切尽在掌控。",
    emoji: "💰",
  },
];

export default function MemberOnboarding() {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const touchStart = useRef(0);
  const step = steps[current];
  const isLast = current === steps.length - 1;

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStart.current;
    if (Math.abs(dx) < 40) return;
    if (dx < 0 && current < steps.length - 1) setCurrent(c => c + 1);
    if (dx > 0 && current > 0) setCurrent(c => c - 1);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "hsl(var(--m-bg-1))", color: "hsl(var(--m-text))" }}>
      {/* Skip */}
      <div className="flex justify-end px-5 pt-5">
        <button onClick={() => navigate("/member/dashboard")}
          className="text-[11px] font-bold text-[hsl(var(--m-text-dim))] hover:text-[hsl(var(--m-text))] transition">
          跳过
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8"
        onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        {/* Animated icon */}
        <div className="relative mb-8">
          <div className="w-24 h-24 rounded-3xl flex items-center justify-center animate-fade-in"
            key={current}
            style={{
              background: `linear-gradient(135deg, hsl(var(${step.color}) / 0.12), hsl(var(${step.color}) / 0.04))`,
              border: `1px solid hsl(var(${step.color}) / 0.15)`,
              boxShadow: `0 0 40px -8px hsl(var(${step.color}) / 0.3)`,
            }}>
            <span className="text-4xl">{step.emoji}</span>
          </div>
          {/* Floating ring */}
          <div className="absolute -inset-3 rounded-[28px] border border-[hsl(var(--m-surface-border)_/_0.1)] animate-pulse" />
        </div>

        {/* Text */}
        <div className="text-center animate-fade-in" key={`text-${current}`}>
          <h1 className="text-2xl font-extrabold tracking-tight mb-3">{step.title}</h1>
          <p className="text-sm text-[hsl(var(--m-text-dim))] leading-relaxed max-w-[280px] mx-auto">{step.desc}</p>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="px-6 pb-10">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-6">
          {steps.map((_, i) => (
            <div key={i} className="h-1.5 rounded-full transition-all duration-300"
              style={{
                width: i === current ? 24 : 8,
                background: i === current
                  ? `hsl(var(${steps[current].color}))`
                  : "hsl(var(--m-surface-border) / 0.3)",
              }} />
          ))}
        </div>

        <button
          onClick={() => {
            if (isLast) {
              navigate("/member/dashboard");
            } else {
              setCurrent((c) => c + 1);
            }
          }}
          className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
          style={{
            background: isLast
              ? "linear-gradient(135deg, hsl(var(--gold-deep)), hsl(var(--gold)))"
              : "linear-gradient(135deg, hsl(var(--gold)), hsl(var(--gold-soft)))",
            color: "white",
            boxShadow: isLast
              ? "0 6px 24px -6px hsl(var(--gold-deep) / 0.45)"
              : "0 6px 24px -6px hsl(var(--gold) / 0.45)",
          }}>
          {isLast ? "开始使用" : "下一步"}
          {isLast ? <ChevronRight className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
