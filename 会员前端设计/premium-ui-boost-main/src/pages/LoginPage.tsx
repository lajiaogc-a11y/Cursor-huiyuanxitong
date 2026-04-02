import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Eye, EyeOff, ArrowRight, Zap, TrendingUp, Shield, ChevronRight, UserPlus, Phone, KeyRound, CheckSquare, Square, Sparkles, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import banner1 from "@/assets/banner-1.jpg";
import banner2 from "@/assets/banner-2.jpg";
import banner3 from "@/assets/banner-3.jpg";

const banners = [
  { src: banner1, alt: "VIP Rewards" },
  { src: banner2, alt: "Invite & Earn" },
  { src: banner3, alt: "Daily Spin" },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"idle" | "login" | "register">("idle");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [form, setForm] = useState({ phone: "", password: "", confirm: "", inviteCode: "" });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "register") {
      if (form.password !== form.confirm) {
        toast.error("两次密码不一致");
        return;
      }
      if (!agreed) {
        toast.error("请先同意服务条款");
        return;
      }
    }
    toast.success(mode === "login" ? "登录成功" : "🎉 注册成功！");
    navigate(mode === "login" ? "/member/dashboard" : "/member/onboarding");
  };

  const inputStyle = {
    background: "hsl(var(--m-surface) / 0.45)",
    border: "1px solid hsl(var(--m-surface-border) / 0.25)",
    color: "hsl(var(--m-text))",
  };

  // ── Banner Carousel state ──
  const [bannerIdx, setBannerIdx] = useState(0);

  // Auto-rotate banners
  useEffect(() => {
    if (mode !== "idle") return;
    const timer = setInterval(() => {
      setBannerIdx((i) => (i + 1) % banners.length);
    }, 4000);
    return () => clearInterval(timer);
  }, [mode]);

  // ── Landing ──
  if (mode === "idle") {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "hsl(var(--m-bg-1))", color: "hsl(var(--m-text))" }}>
        <div className="relative flex-1 flex flex-col">
          {/* Logo bar */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--gold-soft)))", boxShadow: "0 4px 16px -4px hsl(var(--primary) / 0.4)" }}>
                <Zap className="w-4.5 h-4.5 text-white" />
              </div>
              <span className="text-base font-extrabold tracking-tight">FastGC</span>
            </div>
          </div>

          {/* ── Image Carousel ── */}
          <div className="px-5 mb-8">
            <div
              className="relative rounded-2xl overflow-hidden"
              style={{ aspectRatio: "2/1" }}
              onTouchStart={(e) => {
                const touch = e.touches[0];
                (e.currentTarget as any)._touchStartX = touch.clientX;
                (e.currentTarget as any)._touchStartY = touch.clientY;
              }}
              onTouchEnd={(e) => {
                const startX = (e.currentTarget as any)._touchStartX;
                const startY = (e.currentTarget as any)._touchStartY;
                if (startX == null) return;
                const endX = e.changedTouches[0].clientX;
                const endY = e.changedTouches[0].clientY;
                const dx = endX - startX;
                const dy = endY - startY;
                if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
                  if (dx < 0) setBannerIdx((i) => (i + 1) % banners.length);
                  else setBannerIdx((i) => (i - 1 + banners.length) % banners.length);
                }
              }}
            >
              {banners.map((b, i) => (
                <img
                  key={i}
                  src={b.src}
                  alt={b.alt}
                  width={1024}
                  height={512}
                  className="absolute inset-0 w-full h-full object-cover transition-all duration-700 ease-in-out"
                  style={{
                    opacity: i === bannerIdx ? 1 : 0,
                    transform: i === bannerIdx ? "scale(1)" : "scale(1.05)",
                  }}
                  loading={i === 0 ? "eager" : "lazy"}
                />
              ))}
              <button
                onClick={() => setBannerIdx((i) => (i - 1 + banners.length) % banners.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center transition bg-black/30 hover:bg-black/50 backdrop-blur-sm">
                <ChevronLeft className="w-4 h-4 text-white" />
              </button>
              <button
                onClick={() => setBannerIdx((i) => (i + 1) % banners.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center transition bg-black/30 hover:bg-black/50 backdrop-blur-sm">
                <ChevronRight className="w-4 h-4 text-white" />
              </button>
              <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex gap-1.5">
                {banners.map((_, i) => (
                  <button key={i} onClick={() => setBannerIdx(i)}
                    className="h-1.5 rounded-full transition-all duration-300"
                    style={{
                      width: i === bannerIdx ? 20 : 6,
                      background: i === bannerIdx ? "hsl(var(--primary))" : "hsl(0 0% 100% / 0.4)",
                    }} />
                ))}
              </div>
            </div>
          </div>

          {/* Headline */}
          <div className="px-6 mb-8">
            <h1 className="text-[28px] font-extrabold leading-[1.2] tracking-tight mb-3">
              Your Rewards,<br />
              <span className="text-primary">Simplified.</span>
            </h1>
            <p className="text-[13px] text-[hsl(var(--m-text-dim))] leading-relaxed">
              Manage points, redeem gifts, and earn rewards<br />by inviting friends.
            </p>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2.5 px-5 mb-6">
            {[
              { value: "50K+", label: "Active Users", icon: TrendingUp },
              { value: "99.9%", label: "Secure", icon: Shield },
              { value: "24h", label: "Fast Payout", icon: Zap },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl p-3.5 text-center"
                style={{ background: "hsl(var(--m-surface) / 0.35)", border: "1px solid hsl(var(--m-surface-border) / 0.2)" }}>
                <s.icon className="w-4 h-4 mx-auto mb-2 text-[hsl(var(--m-text-dim)_/_0.4)]" />
                <div className="text-sm font-extrabold tracking-tight">{s.value}</div>
                <div className="text-[10px] text-[hsl(var(--m-text-dim))] font-medium mt-0.5 tracking-wide">{s.label}</div>
              </div>
            ))}
          </div>

          <div className="flex-1" />

          {/* CTA */}
          <div className="px-5 pb-8 space-y-3">
            <button onClick={() => setMode("login")}
              className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
              style={{
                background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--gold-soft)))",
                color: "white",
                boxShadow: "0 6px 28px -6px hsl(var(--primary) / 0.45)",
              }}>
              Sign In
              <ChevronRight className="w-4 h-4" />
            </button>
            <button onClick={() => setMode("register")}
              className="w-full py-4 rounded-2xl font-bold text-sm transition-all active:scale-[0.97]"
              style={{ background: "hsl(var(--m-surface) / 0.5)", border: "1px solid hsl(var(--m-surface-border) / 0.3)" }}>
              Create Account
            </button>
            <p className="text-center text-[10px] text-[hsl(var(--m-text-dim)_/_0.4)] pt-1">
              By signing in you agree to our Terms & Privacy Policy
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Login Form — Original Design ──
  if (mode === "login") {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "hsl(var(--m-bg-1))", color: "hsl(var(--m-text))" }}>
        {/* Top accent bar */}
        <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, hsl(var(--gold)), hsl(var(--emerald)), hsl(var(--gold-soft)))" }} />

        <div className="relative flex-1 flex flex-col px-6">
          {/* Back */}
          <button onClick={() => setMode("idle")}
            className="self-start mt-5 mb-6 text-xs font-bold text-[hsl(var(--m-text-dim))] hover:text-[hsl(var(--m-text))] transition">
            ← 返回
          </button>

          {/* Logo centered */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
              style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--gold-soft)))", boxShadow: "0 6px 20px -6px hsl(var(--primary) / 0.5)" }}>
              <Zap className="w-5 h-5 text-[hsl(var(--m-bg-1))]" />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight">安全登录</h1>
            <p className="text-[11px] text-[hsl(var(--m-text-dim))] mt-1">访问您的会员账户与专属权益</p>
          </div>

          {/* Form card */}
          <div className="rounded-2xl p-5 mb-6"
            style={{ background: "hsl(var(--m-surface) / 0.3)", border: "1px solid hsl(var(--m-surface-border) / 0.2)" }}>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Phone */}
              <div>
                <label className="text-[11px] font-bold text-[hsl(var(--m-text-dim))] mb-2 block">手机 / 会员编号</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--m-text-dim)_/_0.35)]" />
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="请输入手机号"
                    className="w-full rounded-xl pl-10 pr-4 py-3.5 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-gold/25"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="text-[11px] font-bold text-[hsl(var(--m-text-dim))] mb-2 block">密码</label>
                <div className="relative">
                  <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--m-text-dim)_/_0.35)]" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="请输入密码"
                    className="w-full rounded-xl pl-10 pr-12 py-3.5 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-gold/25"
                    style={inputStyle}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[hsl(var(--m-text-dim)_/_0.4)]">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Remember + Forgot */}
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setAgreed(!agreed)} className="flex items-center gap-2">
                  {agreed ? (
                    <CheckSquare className="w-4 h-4" style={{ color: "hsl(var(--emerald-soft))" }} />
                  ) : (
                    <Square className="w-4 h-4 text-[hsl(var(--m-text-dim)_/_0.3)]" />
                  )}
                  <span className="text-[11px] text-[hsl(var(--m-text-dim))]">记住账号</span>
                </button>
                <button type="button" className="text-[11px] font-bold transition"
                  style={{ color: "hsl(var(--gold-soft))" }}>
                  忘记密码？
                </button>
              </div>

              {/* Submit */}
              <button type="submit"
                className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97]"
                style={{
                  background: "linear-gradient(135deg, hsl(var(--gold)), hsl(var(--gold-soft)))",
                  color: "white",
                  boxShadow: "0 8px 28px -8px hsl(var(--gold) / 0.5)",
                }}>
                登录
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>

          {/* Switch to register */}
          <p className="text-center text-xs text-[hsl(var(--m-text-dim))]">
            还没有账号？
            <button type="button" onClick={() => setMode("register")}
              className="font-bold ml-1 underline underline-offset-2 transition" style={{ color: "hsl(var(--emerald-soft))" }}>
              使用邀请码注册
            </button>
          </p>

          <div className="flex-1" />

          {/* Trust footer */}
          <div className="flex items-center justify-center gap-4 pb-8 pt-4">
            {[
              { icon: Shield, label: "SSL" },
              { icon: Lock, label: "加密" },
              { icon: Sparkles, label: "验证" },
            ].map((b) => (
              <div key={b.label} className="flex items-center gap-1">
                <b.icon className="w-3 h-3 text-[hsl(var(--m-text-dim)_/_0.3)]" />
                <span className="text-[10px] text-[hsl(var(--m-text-dim)_/_0.3)] font-medium">{b.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Register Form — Clean Financial Style ──
  return (
    <div className="min-h-screen flex flex-col" style={{ background: "hsl(var(--m-bg-1))", color: "hsl(var(--m-text))" }}>
      {/* Hero header */}
      <div className="relative pt-14 pb-10 flex flex-col items-center overflow-hidden">
        {/* Subtle background glow */}
        <div className="absolute -top-20 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full bg-primary/[0.06] blur-[100px] pointer-events-none" />

        {/* Back button */}
        <button onClick={() => setMode("idle")}
          className="absolute top-5 left-5 text-xs font-bold text-[hsl(var(--m-text-dim))] hover:text-[hsl(var(--m-text))] transition z-10">
          ← 返回
        </button>

        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-3 relative"
          style={{
            background: "linear-gradient(135deg, hsl(var(--emerald)), hsl(var(--emerald-soft)))",
            boxShadow: "0 8px 32px -8px hsl(var(--emerald) / 0.4)",
          }}>
          <UserPlus className="w-6 h-6 text-white" />
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[hsl(var(--m-text-dim))]">FASTGC</span>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col px-6">
        {/* Title */}
        <div className="mb-5">
          <h1 className="text-xl font-extrabold tracking-tight mb-1">创建账号</h1>
          <p className="text-xs text-[hsl(var(--m-text-dim))] leading-relaxed">
            注册即可解锁钱包、积分商城与每日抽奖
          </p>
        </div>

        {/* Perks strip */}
        <div className="flex flex-wrap justify-center gap-2 mb-6">
          {[
            { emoji: "🎰", text: "免费抽奖" },
            { emoji: "💰", text: "积分兑换" },
            { emoji: "🎁", text: "新人礼包" },
          ].map((p) => (
            <span key={p.text}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold"
              style={{ background: "hsl(var(--m-surface) / 0.5)", border: "1px solid hsl(var(--m-surface-border) / 0.2)" }}>
              <span>{p.emoji}</span>
              {p.text}
            </span>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col">
          <div className="space-y-5">
            {/* Phone */}
            <div>
              <label className="text-[11px] font-bold text-[hsl(var(--m-text-dim))] mb-2 block">手机号码</label>
              <div className="relative">
                <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--m-text-dim)_/_0.4)]" />
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="e.g. 08012345678"
                  className="w-full rounded-xl pl-10 pr-4 py-3.5 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-primary/20"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="text-[11px] font-bold text-[hsl(var(--m-text-dim))] mb-2 block">密码 (至少 6 位)</label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--m-text-dim)_/_0.4)]" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  placeholder="创建密码"
                  className="w-full rounded-xl pl-10 pr-12 py-3.5 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-primary/20"
                  style={inputStyle}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[hsl(var(--m-text-dim))]">
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm */}
            <div>
              <label className="text-[11px] font-bold text-[hsl(var(--m-text-dim))] mb-2 block">确认密码</label>
              <div className="relative">
                <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--m-text-dim)_/_0.4)]" />
                <input
                  type="password"
                  value={form.confirm}
                  onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                  placeholder="确认密码"
                  className="w-full rounded-xl pl-10 pr-4 py-3.5 text-sm font-medium outline-none transition-all focus:ring-2 focus:ring-primary/20"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Invite code */}
            <div>
              <label className="text-[11px] font-bold text-[hsl(var(--m-text-dim))] mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3 h-3 text-accent" />
                邀请码
                <span className="text-[hsl(var(--m-text-dim)_/_0.4)] font-normal">(选填)</span>
              </label>
              <input
                type="text"
                value={form.inviteCode}
                onChange={(e) => setForm({ ...form, inviteCode: e.target.value.toUpperCase() })}
                placeholder="粘贴邀请码"
                maxLength={12}
                className="w-full rounded-xl px-4 py-3.5 text-sm font-mono font-medium outline-none transition-all focus:ring-2 focus:ring-accent/20 uppercase tracking-wider"
                style={inputStyle}
              />
            </div>
          </div>

          {/* Terms */}
          <button type="button" onClick={() => setAgreed(!agreed)}
            className="flex items-start gap-2.5 mt-6 text-left">
            {agreed ? (
              <CheckSquare className="w-4 h-4 shrink-0 mt-0.5 text-emerald" />
            ) : (
              <Square className="w-4 h-4 shrink-0 mt-0.5 text-[hsl(var(--m-text-dim)_/_0.4)]" />
            )}
            <span className="text-[11px] text-[hsl(var(--m-text-dim))] leading-relaxed">
              我已阅读并同意
              <span className="font-bold text-primary"> 服务条款</span> 与
              <span className="font-bold text-primary"> 隐私说明</span>。
            </span>
          </button>

          <div className="flex-1 min-h-[24px]" />

          {/* Submit */}
          <button type="submit"
            className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.97] mb-3"
            style={{
              background: agreed
                ? "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--gold-soft)))"
                : "hsl(var(--m-surface) / 0.5)",
              color: agreed ? "white" : "hsl(var(--m-text-dim))",
              boxShadow: agreed ? "0 6px 24px -6px hsl(var(--primary) / 0.45)" : "none",
              border: agreed ? "none" : "1px solid hsl(var(--m-surface-border) / 0.3)",
            }}>
            立即注册
            <ArrowRight className="w-4 h-4" />
          </button>

          <p className="text-center text-xs text-[hsl(var(--m-text-dim))] mb-6">
            已有账号？
            <button type="button" onClick={() => setMode("login")}
              className="font-bold ml-1 text-primary transition">
              去登录
            </button>
          </p>

          {/* Trust footer */}
          <div className="flex items-center justify-center gap-4 mb-4">
            {[
              { icon: Shield, label: "SSL" },
              { icon: Lock, label: "加密" },
              { icon: Sparkles, label: "验证" },
            ].map((b) => (
              <div key={b.label} className="flex items-center gap-1">
                <b.icon className="w-3 h-3 text-[hsl(var(--m-text-dim)_/_0.35)]" />
                <span className="text-[10px] text-[hsl(var(--m-text-dim)_/_0.35)] font-medium">{b.label}</span>
              </div>
            ))}
          </div>
        </form>
      </div>
    </div>
  );
}
