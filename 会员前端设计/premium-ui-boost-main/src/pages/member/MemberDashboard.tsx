import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Gift, Users, CheckCircle, Share2, Star,
  ShieldCheck, Megaphone, Sparkles, Wallet, ChevronRight, Settings,
  Bell, ShoppingCart, Sun, Moon,
} from "lucide-react";
import MemberLayout from "@/components/member/MemberLayout";
import { DashboardSkeleton } from "@/components/member/MemberSkeleton";
import { useTheme } from "@/hooks/use-theme";
import { toast } from "sonner";

/* ─── Mock Data ─── */
const member = {
  username: "john_doe", real_name: "John Doe",
  phone: "+60 12-345 6789", level: "Gold", avatar: "",
};
const points = {
  totalPoints: 3850, availablePoints: 2650, frozenPoints: 1200,
  todayEarned: 150,
};
const spinQuota = { remaining: 3, total: 5 };
const dailyTasks = [
  { id: "checkin", label: "每日签到", icon: "✅", done: true, reward: "+10 积分" },
  { id: "share", label: "分享好友", icon: "📤", done: false, reward: "+20 积分" },
  { id: "order", label: "完成一笔订单", icon: "🛒", done: false, reward: "+50 积分" },
];
const announcements = [
  { id: 1, title: "系统升级通知", content: "系统将于今晚 22:00 进行维护升级，预计持续 2 小时。", date: "2024-03-01" },
  { id: 2, title: "新活动上线", content: "邀请好友注册即可获得额外抽奖机会！", date: "2024-02-28" },
];
const quickActions = [
  { icon: Gift, label: "积分商城", path: "/member/points", gradient: "from-gold to-gold-soft" },
  { icon: Star, label: "幸运抽奖", path: "/member/spin", gradient: "from-rose to-rose-soft" },
  { icon: Users, label: "邀请好友", path: "/member/invite", gradient: "from-emerald to-emerald-soft" },
  { icon: Wallet, label: "我的钱包", path: "/member/wallet", gradient: "from-silver to-silver-soft" },
];

const banners = [
  {
    title: "春季积分狂欢",
    desc: "消费满 500 积分翻倍，限时 3 天",
    gradient: "linear-gradient(135deg, hsl(219 40% 14%), hsl(216 50% 8%))",
    accent: "--gold",
  },
  {
    title: "邀请好友赢大奖",
    desc: "每邀请 1 人即得 10 次免费抽奖",
    gradient: "linear-gradient(135deg, hsl(252 35% 14%), hsl(216 50% 8%))",
    accent: "--violet",
  },
  {
    title: "新品上架通知",
    desc: "限量版商品已上线积分商城",
    gradient: "linear-gradient(135deg, hsl(219 50% 16%), hsl(216 50% 8%))",
    accent: "--gold-deep",
  },
];

export default function MemberDashboard() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [loading, setLoading] = useState(true);
  const [bannerIdx, setBannerIdx] = useState(0);
  const [sliding, setSliding] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  const nextBanner = useCallback(() => {
    setSliding(true);
    setTimeout(() => {
      setBannerIdx((i) => (i + 1) % banners.length);
      setSliding(false);
    }, 300);
  }, []);

  useEffect(() => {
    const timer = setInterval(nextBanner, 4000);
    return () => clearInterval(timer);
  }, [nextBanner]);

  if (loading) return <MemberLayout><DashboardSkeleton /></MemberLayout>;

  return (
    <MemberLayout>
      <div className="m-page-bg">
        {/* Hero */}
        <div className="relative overflow-hidden">
          {/* Decorative orbs */}
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-gold/[0.06] blur-[100px]" />
          <div className="absolute -bottom-16 -left-16 w-60 h-60 rounded-full bg-emerald/[0.04] blur-[80px]" />

          <div className="relative px-5 pt-7 pb-8">
            {/* User info */}
            <div className="flex items-center justify-between mb-7">
              <div className="flex items-center gap-3.5">
                <div className="w-[52px] h-[52px] rounded-2xl bg-gradient-to-br from-gold to-gold-deep flex items-center justify-center text-lg font-extrabold text-primary-foreground shadow-glow-gold">
                  {member.real_name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-lg font-extrabold">{member.real_name}</h2>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-gold/15 text-gold-soft font-bold ring-1 ring-inset ring-gold/20 tracking-wide">
                    {member.level}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={toggleTheme} className="p-2.5 rounded-xl bg-[hsl(var(--m-surface)_/_0.6)] hover:bg-[hsl(var(--m-surface)_/_0.9)] transition border border-[hsl(var(--m-surface-border)_/_0.3)]">
                  {theme === "dark" ? <Sun className="h-5 w-5 text-gold-soft" /> : <Moon className="h-5 w-5 text-[hsl(var(--m-text-dim))]" />}
                </button>
                <button onClick={() => navigate("/member/notifications")} className="relative p-2.5 rounded-xl bg-[hsl(var(--m-surface)_/_0.6)] hover:bg-[hsl(var(--m-surface)_/_0.9)] transition border border-[hsl(var(--m-surface-border)_/_0.3)]">
                  <Bell className="h-5 w-5 text-[hsl(var(--m-text-dim))]" />
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-destructive flex items-center justify-center text-[8px] font-extrabold text-white">3</span>
                </button>
                <button onClick={() => navigate("/member/settings")} className="p-2.5 rounded-xl bg-[hsl(var(--m-surface)_/_0.6)] hover:bg-[hsl(var(--m-surface)_/_0.9)] transition border border-[hsl(var(--m-surface-border)_/_0.3)]">
                  <Settings className="h-5 w-5 text-[hsl(var(--m-text-dim))]" />
                </button>
              </div>
            </div>

            {/* ── Banner Carousel ── */}
            <div className="mb-5">
              <div
                className="rounded-2xl p-5 pb-4 relative overflow-hidden transition-all duration-300 min-h-[120px]"
                style={{
                  background: banners[bannerIdx].gradient,
                  border: "1px solid hsl(var(--m-surface-border) / 0.25)",
                  opacity: sliding ? 0 : 1,
                  transform: sliding ? "translateX(-12px)" : "translateX(0)",
                }}
              >
                {/* Ambient glow */}
                <div className="absolute top-0 right-0 w-40 h-40 rounded-full blur-[60px] pointer-events-none"
                  style={{ background: `hsl(var(${banners[bannerIdx].accent}) / 0.15)` }} />

                <div className="relative">
                  <h3 className="text-lg font-extrabold mb-1.5 drop-shadow-sm">{banners[bannerIdx].title}</h3>
                  <p className="text-sm text-[hsl(var(--m-text)_/_0.75)] leading-relaxed font-medium">{banners[bannerIdx].desc}</p>
                </div>

                {/* Dots */}
                <div className="flex items-center gap-1.5 mt-4">
                  {banners.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => { setSliding(true); setTimeout(() => { setBannerIdx(i); setSliding(false); }, 300); }}
                      className="transition-all duration-300 rounded-full"
                      style={{
                        width: i === bannerIdx ? 20 : 6,
                        height: 6,
                        background: i === bannerIdx
                          ? "hsl(var(--m-text))"
                          : "hsl(var(--m-text) / 0.25)",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* System Announcement Marquee */}
            <div className="m-glass p-3 mb-4 flex items-center gap-2.5 overflow-hidden">
              <Megaphone className="w-4 h-4 text-rose-soft shrink-0" />
              <div className="overflow-hidden flex-1 relative">
                <div className="whitespace-nowrap animate-[marquee_18s_linear_infinite] inline-block">
                  {announcements.map((a, i) => (
                    <span key={a.id} className="text-sm text-[hsl(var(--m-text)_/_0.7)] font-medium">
                      {a.title}：{a.content}
                      {i < announcements.length - 1 && <span className="mx-6 text-[hsl(var(--m-surface-border))]">|</span>}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Points Card — 4 equal blocks */}
            <div className="mb-4">
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: "总积分", value: points.totalPoints, color: "text-[hsl(var(--m-text))]", accent: "from-gold/[0.06] to-gold/[0.02]" },
                  { label: "可用积分", value: points.availablePoints, color: "text-gold", accent: "from-emerald/[0.06] to-emerald/[0.02]" },
                  { label: "冻结积分", value: points.frozenPoints, color: "text-rose-soft", accent: "from-rose/[0.06] to-rose/[0.02]" },
                  { label: "今日获得", value: points.todayEarned, color: "text-emerald", accent: "from-emerald/[0.06] to-emerald/[0.02]" },
                ].map((item) => (
                  <div key={item.label} className="m-glass p-4 text-center relative overflow-hidden">
                    <div className={`absolute inset-0 bg-gradient-to-br ${item.accent} pointer-events-none rounded-[inherit]`} />
                    <div className="relative">
                      <div className="text-[11px] text-[hsl(var(--m-text-dim))] mb-2 font-bold tracking-wide">{item.label}</div>
                      <div className={`text-2xl font-extrabold tabular-nums ${item.color}`}>{item.value.toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="px-5 -mt-2 mb-7">
          <div className="grid grid-cols-4 gap-3">
            {quickActions.map((action) => (
              <button
                key={action.label}
                onClick={() => navigate(action.path)}
                className="flex flex-col items-center gap-2 p-3 rounded-2xl transition-all duration-200 group"
              >
                <div
                  className={`w-[52px] h-[52px] rounded-2xl bg-gradient-to-br ${action.gradient} flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform duration-300`}
                  style={{ boxShadow: '0 6px 20px -6px hsl(var(--m-surface-border) / 0.4)' }}
                >
                  <action.icon className="h-[22px] w-[22px] text-white" />
                </div>
                <span className="text-[11px] text-[hsl(var(--m-text-dim))] group-hover:text-[hsl(var(--m-text))] transition font-bold">{action.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Spin Banner */}
        <div className="px-5 mb-7">
          <button onClick={() => navigate("/member/spin")} className="w-full m-glass p-4 flex items-center justify-between relative overflow-hidden text-left" style={{ borderColor: 'hsl(var(--m-glow-gold) / 0.15)' }}>
            <div className="absolute inset-0 bg-gradient-to-r from-gold/[0.05] to-rose/[0.03] pointer-events-none rounded-[inherit]" />
            <div className="flex items-center gap-3 relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose to-rose-soft flex items-center justify-center shadow-glow-rose">
                <Sparkles className="h-5 w-5 text-[hsl(0_0%_100%)]" />
              </div>
              <div>
                <div className="font-bold text-rose-soft">幸运抽奖</div>
                <div className="text-[11px] text-[hsl(var(--m-text-dim))] font-medium">剩余 {spinQuota.remaining} 次抽奖机会</div>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-[hsl(var(--m-text-dim)_/_0.4)] relative" />
          </button>
        </div>

        {/* Daily Tasks */}
        <div className="px-5 mb-7">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-extrabold">每日任务</h3>
            <span className="text-[11px] text-[hsl(var(--m-text-dim))] font-bold">{dailyTasks.filter(t => t.done).length}/{dailyTasks.length} 已完成</span>
          </div>
          <div className="space-y-2.5">
            {dailyTasks.map((task) => (
              <div
                key={task.id}
                className={`rounded-xl p-4 flex items-center justify-between transition-all duration-200 ${
                  task.done
                    ? "bg-emerald/[0.07] border border-emerald/10 ring-1 ring-inset ring-emerald/10"
                    : "bg-[hsl(var(--m-surface)_/_0.4)] border border-[hsl(var(--m-surface-border)_/_0.3)]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{task.icon}</span>
                  <div>
                    <div className={`text-sm font-bold ${task.done ? "text-emerald-soft" : ""}`}>
                      {task.label}
                    </div>
                    <div className="text-[11px] text-[hsl(var(--m-text-dim))] font-medium">{task.reward}</div>
                  </div>
                </div>
                {task.done ? (
                  <CheckCircle className="h-5 w-5 text-emerald" />
                ) : (
                  <button onClick={() => toast.info("任务功能即将上线")} className="btn-glow px-4 py-1.5 text-xs rounded-xl active:scale-95 transition-transform">
                    去完成
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Announcements */}
        <div className="px-5 mb-7">
          <div className="flex items-center gap-2 mb-4">
            <Megaphone className="h-4 w-4 text-rose" />
            <h3 className="text-base font-extrabold">系统公告</h3>
          </div>
          <div className="space-y-2.5">
            {announcements.map((item) => (
              <div key={item.id} className="m-glass p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-sm">{item.title}</span>
                  <span className="text-[10px] text-[hsl(var(--m-text-dim)_/_0.6)] font-medium">{item.date}</span>
                </div>
                <p className="text-xs text-[hsl(var(--m-text-dim))] leading-relaxed">{item.content}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Invite CTA */}
        <div className="px-5 mb-8">
          <div className="m-glass p-6 text-center relative overflow-hidden" style={{ borderColor: 'hsl(var(--m-glow-emerald) / 0.15)' }}>
            <div className="absolute inset-0 bg-gradient-to-br from-emerald/[0.04] to-gold/[0.03] pointer-events-none rounded-[inherit]" />
            <div className="relative">
              <Share2 className="h-8 w-8 text-emerald mx-auto mb-3" />
              <h3 className="font-extrabold text-lg mb-1">邀请好友赚积分</h3>
              <p className="text-xs text-[hsl(var(--m-text-dim))] mb-5">每邀请一位好友注册，即可获得 200 积分奖励</p>
              <button onClick={() => navigate("/member/invite")} className="btn-glow px-8 py-2.5 text-sm rounded-xl active:scale-95 transition-transform">
                立即邀请
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-24 text-center">
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-[hsl(var(--m-text-dim)_/_0.4)]">
            <ShieldCheck className="h-3 w-3" />
            <span>账户数据安全加密，平台合规运营，请放心使用</span>
          </div>
        </div>
      </div>
    </MemberLayout>
  );
}
