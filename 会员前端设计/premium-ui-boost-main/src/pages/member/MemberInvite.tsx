import { useState, useCallback, useRef, useEffect } from "react";
import { Users, Zap, ArrowRight, Copy, Send, Share2, Trophy, TrendingUp, ShieldCheck, CheckCircle, PartyPopper, QrCode, Download } from "lucide-react";
import MemberLayout from "@/components/member/MemberLayout";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { QRCodeSVG } from "qrcode.react";
import { ListSkeleton } from "@/components/member/MemberSkeleton";

const inviteLink = "https://crm.fastgc.cc/invite/mt277fsh";

const initialLeaderboard: { rank: number; name: string; count: number; medal: string; highlight?: boolean }[] = [
  { rank: 1, name: "A***x", count: 87, medal: "🥇" },
  { rank: 2, name: "L***a", count: 64, medal: "🥈" },
  { rank: 3, name: "K***n", count: 51, medal: "🥉" },
];

/* ── Animated counter hook ── */
function useAnimatedNumber(target: number, duration = 600) {
  const [display, setDisplay] = useState(target);
  const prev = useRef(target);

  useEffect(() => {
    const from = prev.current;
    if (from === target) return;
    prev.current = target;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setDisplay(Math.round(from + (target - from) * eased));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration]);

  return display;
}

/* ── Success celebration ── */
function fireInviteConfetti() {
  const colors = ["#d4a745", "#34d399", "#f5c842"];
  confetti({ particleCount: 60, spread: 55, origin: { y: 0.6 }, colors, gravity: 0.8 });
  setTimeout(() => {
    confetti({ particleCount: 40, spread: 70, origin: { y: 0.5, x: 0.3 }, colors });
    confetti({ particleCount: 40, spread: 70, origin: { y: 0.5, x: 0.7 }, colors });
  }, 200);
}

export default function MemberInvite() {
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);
  const [invited, setInvited] = useState(12);
  const [pending, setPending] = useState(3);
  const [totalReward, setTotalReward] = useState(120);
  const [myRank, setMyRank] = useState(12);
  const [successBanner, setSuccessBanner] = useState(false);
  const [recentInvites, setRecentInvites] = useState<{ name: string; time: string }[]>([]);

  const animInvited = useAnimatedNumber(invited);
  const animPending = useAnimatedNumber(pending);
  const animReward = useAnimatedNumber(totalReward);

  const stats = [
    { label: "已邀请", value: animInvited, icon: Users, accent: "--gold" },
    { label: "总奖励", value: animReward, icon: Trophy, accent: "--emerald" },
  ];

  const leaderboard = [
    ...initialLeaderboard,
    { rank: 4, name: "你", count: myRank, medal: "", highlight: true },
  ];

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      toast.success("已复制邀请链接");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("复制失败");
    }
  };

  /* Simulate a new invite arriving */
  const simulateInvite = useCallback(() => {
    const names = ["小明", "Alice", "Bob", "小红", "Charlie", "David", "小李"];
    const newName = names[Math.floor(Math.random() * names.length)];
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    // Update stats with animation
    setInvited((p) => p + 1);
    setPending((p) => p + 1);
    setTotalReward((p) => p + 10);
    setMyRank((p) => p + 1);

    // Add to recent invites
    setRecentInvites((prev) => [{ name: newName, time: timeStr }, ...prev].slice(0, 5));

    // Show success banner
    setSuccessBanner(true);
    fireInviteConfetti();
    toast.success(`🎉 ${newName} 通过你的链接注册成功！+10 次抽奖`);

    setTimeout(() => setSuccessBanner(false), 3000);
  }, []);

  if (loading) return <MemberLayout><ListSkeleton /></MemberLayout>;

  return (
    <MemberLayout>
      <div className="m-page-bg">
        {/* ── Success Banner (animated slide-in) ── */}
        <div
          className="overflow-hidden transition-all duration-500 ease-out"
          style={{ maxHeight: successBanner ? 64 : 0, opacity: successBanner ? 1 : 0 }}
        >
          <div className="mx-5 mt-4 rounded-xl px-4 py-3 flex items-center gap-3"
            style={{
              background: "linear-gradient(135deg, hsl(var(--emerald) / 0.12), hsl(var(--gold) / 0.08))",
              border: "1px solid hsl(var(--emerald) / 0.2)",
            }}>
            <PartyPopper className="w-5 h-5 text-emerald shrink-0" />
            <p className="text-xs font-bold text-emerald-soft flex-1">新好友注册成功！奖励已发放 🎉</p>

            <CheckCircle className="w-4 h-4 text-emerald shrink-0" />
          </div>
        </div>

        {/* ── Hero Section ── */}
        <div className="relative overflow-hidden">
          <div className="absolute -top-24 -left-24 w-72 h-72 rounded-full bg-emerald/[0.06] blur-[100px]" />
          <div className="absolute top-10 -right-20 w-60 h-60 rounded-full bg-gold/[0.08] blur-[80px]" />

          <div className="relative px-5 pt-8 pb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald to-emerald-soft flex items-center justify-center">
                  <Users className="w-4 h-4 text-[hsl(var(--m-bg-1))]" />
                </div>
                <h1 className="text-xl font-extrabold">邀请计划</h1>
              </div>
            </div>
            <p className="text-xs text-[hsl(var(--m-text-dim))] font-medium leading-relaxed">
              邀请好友加入，双方各得 <span className="text-emerald-soft font-bold">10 次抽奖</span> 机会
            </p>
          </div>
        </div>

        {/* ── Stats Strip ── */}
        <div className="px-5 mb-6">
          <div className="grid grid-cols-2 gap-2.5">
            {stats.map((s) => (
              <div key={s.label} className="m-glass p-3.5 text-center relative overflow-hidden">
                <div className={`absolute inset-0 bg-gradient-to-br from-[hsl(var(${s.accent})_/_0.06)] to-transparent pointer-events-none rounded-[inherit]`} />
                <div className="relative">
                  <s.icon className="w-4 h-4 mx-auto mb-2" style={{ color: `hsl(var(${s.accent}-soft))` }} />
                  <div className="text-xl font-extrabold mb-0.5 tabular-nums">{s.value}</div>
                  <div className="text-[10px] font-bold text-[hsl(var(--m-text-dim))] tracking-wider uppercase">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Recent Invites (live feed) ── */}
        {recentInvites.length > 0 && (
          <div className="px-5 mb-6">
            <h2 className="text-sm font-extrabold mb-3 flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald animate-pulse" />
              最近邀请
            </h2>
            <div className="space-y-1.5">
              {recentInvites.map((inv, i) => (
                <div key={`${inv.name}-${i}`}
                  className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-all"
                  style={{
                    background: i === 0 ? "hsl(var(--emerald) / 0.06)" : "hsl(var(--m-surface) / 0.25)",
                    border: `1px solid ${i === 0 ? "hsl(var(--emerald) / 0.12)" : "transparent"}`,
                    animation: i === 0 ? "fadeSlideIn 0.4s ease-out" : undefined,
                  }}>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold"
                    style={{ background: "hsl(var(--gold) / 0.1)", color: "hsl(var(--gold-soft))" }}>
                    {inv.name[0]}
                  </div>
                  <div className="flex-1">
                    <span className="text-xs font-bold">{inv.name}</span>
                    <span className="text-[10px] text-[hsl(var(--m-text-dim))] ml-1.5">注册成功</span>
                  </div>
                  <span className="text-[10px] font-mono text-[hsl(var(--m-text-dim)_/_0.5)]">{inv.time}</span>
                  <span className="text-[10px] font-bold text-emerald-soft">+10</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── How it Works — Centered Card Style ── */}
        <div className="px-5 mb-6">
          <h2 className="text-base font-extrabold mb-5 text-center">运作流程</h2>
          <div className="space-y-3">
            {[
              { step: "01", title: "分享专属链接", desc: "将你的邀请链接发送给好友", color: "--gold", emoji: "📤" },
              { step: "02", title: "好友完成注册", desc: "好友通过链接创建账号", color: "--emerald", emoji: "✅" },
              { step: "03", title: "双方领取奖励", desc: "系统自动发放 10 次抽奖", color: "--gold-deep", emoji: "🎁" },
            ].map((item, i) => (
              <div key={i} className="relative">
                {/* Connector line */}
                {i < 2 && (
                  <div className="absolute left-1/2 -translate-x-1/2 -bottom-3 w-[2px] h-3 z-0"
                    style={{ background: `linear-gradient(to bottom, hsl(var(${item.color}) / 0.3), hsl(var(${item.color}) / 0.05))` }} />
                )}
                <div className="relative rounded-2xl p-4 text-center transition-all hover:scale-[1.02]"
                  style={{
                    background: `linear-gradient(135deg, hsl(var(${item.color}) / 0.06), hsl(var(--m-surface) / 0.4))`,
                    border: `1px solid hsl(var(${item.color}) / 0.12)`,
                  }}>
                  {/* Step number badge */}
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[10px] font-extrabold tracking-widest"
                    style={{
                      background: `hsl(var(${item.color}) / 0.15)`,
                      color: `hsl(var(${item.color}-soft))`,
                      border: `1px solid hsl(var(${item.color}) / 0.2)`,
                    }}>
                    STEP {item.step}
                  </div>
                  <div className="text-2xl mb-2 mt-2">{item.emoji}</div>
                  <p className="text-sm font-extrabold mb-1">{item.title}</p>
                  <p className="text-[11px] text-[hsl(var(--m-text-dim))]">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Invite Link Card ── */}
        <div className="px-5 mb-6">
          <div className="m-glass p-5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-gold/[0.05] to-emerald/[0.03] pointer-events-none rounded-[inherit]" />
            <div className="relative space-y-4">
              <h3 className="text-sm font-extrabold">你的专属链接</h3>
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-xl px-3.5 py-3 text-xs font-mono truncate bg-[hsl(var(--m-bg-1)_/_0.7)] border border-[hsl(var(--m-surface-border)_/_0.3)] text-[hsl(var(--m-text-dim))]">
                  {inviteLink}
                </div>
                <button onClick={handleCopy}
                  className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-90"
                  style={{
                    background: copied
                      ? "hsl(var(--emerald))"
                      : "linear-gradient(135deg, hsl(var(--gold)), hsl(var(--gold-soft)))",
                    boxShadow: `0 4px 16px -4px hsl(var(${copied ? "--emerald" : "--gold"}) / 0.5)`,
                  }}>
                  {copied
                    ? <CheckCircle className="w-4 h-4 text-white" />
                    : <Copy className="w-4 h-4 text-white" />
                  }
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button className="py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 bg-[hsl(var(--m-surface)_/_0.7)] border border-[hsl(var(--m-surface-border)_/_0.3)] hover:border-emerald/30 hover:bg-emerald/[0.06]">
                  <Share2 className="w-3.5 h-3.5 text-emerald-soft" />
                  <span>WhatsApp</span>
                </button>
                <button className="py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 bg-[hsl(var(--m-surface)_/_0.7)] border border-[hsl(var(--m-surface-border)_/_0.3)] hover:border-[hsl(200_80%_50%)_/_0.3] hover:bg-[hsl(200_80%_50%)_/_0.06]">
                  <Send className="w-3.5 h-3.5 text-[hsl(200_70%_60%)]" />
                  <span>Telegram</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── QR Code Card ── */}
        <div className="px-5 mb-6">
          <div className="m-glass p-5 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald/[0.04] to-gold/[0.03] pointer-events-none rounded-[inherit]" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-4">
                <QrCode className="w-4 h-4 text-emerald" />
                <h3 className="text-sm font-extrabold">二维码邀请</h3>
              </div>
              <p className="text-[11px] text-[hsl(var(--m-text-dim))] mb-4">让好友扫描下方二维码直接注册</p>
              
              <div className="flex justify-center mb-4">
                <div className="p-3 rounded-2xl" style={{ background: "white" }}>
                  <QRCodeSVG
                    id="invite-qr-svg"
                    value={inviteLink}
                    size={160}
                    level="M"
                    bgColor="white"
                    fgColor="hsl(240, 25%, 5%)"
                    includeMargin={false}
                  />
                </div>
              </div>

              <p className="text-center text-[10px] font-mono text-[hsl(var(--m-text-dim)_/_0.5)] mb-3 truncate">{inviteLink}</p>

              <button
                onClick={() => {
                  const canvas = document.createElement("canvas");
                  const W = 750, H = 1200;
                  canvas.width = W;
                  canvas.height = H;
                  const ctx = canvas.getContext("2d")!;

                  // Background gradient
                  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
                  bgGrad.addColorStop(0, "#0c0e1a");
                  bgGrad.addColorStop(0.5, "#111530");
                  bgGrad.addColorStop(1, "#0a0f20");
                  ctx.fillStyle = bgGrad;
                  ctx.fillRect(0, 0, W, H);

                  // Decorative circles
                  const drawOrb = (x: number, y: number, r: number, color: string) => {
                    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
                    g.addColorStop(0, color);
                    g.addColorStop(1, "transparent");
                    ctx.fillStyle = g;
                    ctx.fillRect(x - r, y - r, r * 2, r * 2);
                  };
                  drawOrb(100, 150, 250, "rgba(139,92,246,0.12)");
                  drawOrb(650, 900, 300, "rgba(52,211,153,0.08)");

                  // Top badge
                  ctx.fillStyle = "rgba(139,92,246,0.15)";
                  const bw = 200, bh = 40, bx = (W - bw) / 2, by = 80;
                  ctx.beginPath();
                  ctx.roundRect(bx, by, bw, bh, 20);
                  ctx.fill();
                  ctx.fillStyle = "#a78bfa";
                  ctx.font = "bold 18px system-ui, sans-serif";
                  ctx.textAlign = "center";
                  ctx.fillText("✨ 专属邀请", W / 2, by + 27);

                  // Title
                  ctx.fillStyle = "#f0f0f5";
                  ctx.font = "800 48px system-ui, sans-serif";
                  ctx.fillText("邀请好友", W / 2, 200);
                  ctx.font = "800 48px system-ui, sans-serif";
                  ctx.fillText("赢取奖励", W / 2, 260);

                  // Subtitle
                  ctx.fillStyle = "rgba(200,200,220,0.6)";
                  ctx.font = "500 20px system-ui, sans-serif";
                  ctx.fillText("扫描下方二维码注册", W / 2, 310);
                  ctx.fillText("双方各得 10 次免费抽奖机会", W / 2, 340);

                  // QR code container
                  const qrBoxSize = 280;
                  const qrX = (W - qrBoxSize) / 2;
                  const qrY = 400;

                  // Glow behind QR
                  const qrGlow = ctx.createRadialGradient(W / 2, qrY + qrBoxSize / 2, 50, W / 2, qrY + qrBoxSize / 2, 200);
                  qrGlow.addColorStop(0, "rgba(139,92,246,0.15)");
                  qrGlow.addColorStop(1, "transparent");
                  ctx.fillStyle = qrGlow;
                  ctx.fillRect(qrX - 60, qrY - 60, qrBoxSize + 120, qrBoxSize + 120);

                  // White rounded rect for QR
                  ctx.fillStyle = "#ffffff";
                  ctx.beginPath();
                  ctx.roundRect(qrX, qrY, qrBoxSize, qrBoxSize, 24);
                  ctx.fill();

                  // Render QR from SVG
                  const svgEl = document.getElementById("invite-qr-svg");
                  if (svgEl) {
                    const svgData = new XMLSerializer().serializeToString(svgEl);
                    const img = new Image();
                    img.onload = () => {
                      const pad = 24;
                      ctx.drawImage(img, qrX + pad, qrY + pad, qrBoxSize - pad * 2, qrBoxSize - pad * 2);

                      // Invite link
                      ctx.fillStyle = "rgba(200,200,220,0.4)";
                      ctx.font = "500 14px monospace";
                      ctx.textAlign = "center";
                      ctx.fillText(inviteLink, W / 2, qrY + qrBoxSize + 40);

                      // Reward highlights
                      const cardY = qrY + qrBoxSize + 80;
                      const cardW = 300, cardH = 80, gap = 30;
                      // Left card
                      ctx.fillStyle = "rgba(139,92,246,0.1)";
                      ctx.beginPath();
                      ctx.roundRect((W - cardW * 2 - gap) / 2, cardY, cardW, cardH, 16);
                      ctx.fill();
                      ctx.strokeStyle = "rgba(139,92,246,0.2)";
                      ctx.lineWidth = 1;
                      ctx.stroke();
                      ctx.fillStyle = "rgba(200,200,220,0.5)";
                      ctx.font = "600 13px system-ui, sans-serif";
                      ctx.fillText("注册奖励", (W - cardW * 2 - gap) / 2 + cardW / 2, cardY + 30);
                      ctx.fillStyle = "#a78bfa";
                      ctx.font = "800 24px system-ui, sans-serif";
                      ctx.fillText("10 次抽奖", (W - cardW * 2 - gap) / 2 + cardW / 2, cardY + 60);

                      // Right card
                      const rx = (W - cardW * 2 - gap) / 2 + cardW + gap;
                      ctx.fillStyle = "rgba(52,211,153,0.1)";
                      ctx.beginPath();
                      ctx.roundRect(rx, cardY, cardW, cardH, 16);
                      ctx.fill();
                      ctx.strokeStyle = "rgba(52,211,153,0.2)";
                      ctx.lineWidth = 1;
                      ctx.stroke();
                      ctx.fillStyle = "rgba(200,200,220,0.5)";
                      ctx.font = "600 13px system-ui, sans-serif";
                      ctx.fillText("邀请奖励", rx + cardW / 2, cardY + 30);
                      ctx.fillStyle = "#34d399";
                      ctx.font = "800 24px system-ui, sans-serif";
                      ctx.fillText("10 次抽奖", rx + cardW / 2, cardY + 60);

                      // Bottom branding
                      ctx.fillStyle = "rgba(200,200,220,0.25)";
                      ctx.font = "500 14px system-ui, sans-serif";
                      ctx.fillText("— FastGC 会员计划 —", W / 2, H - 60);

                      // Download
                      const link = document.createElement("a");
                      link.download = "invite-poster.png";
                      link.href = canvas.toDataURL("image/png");
                      link.click();
                      toast.success("邀请海报已保存");
                    };
                    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
                  }
                }}
                className="w-full py-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95"
                style={{
                  background: "linear-gradient(135deg, hsl(var(--emerald)), hsl(var(--emerald-soft)))",
                  color: "hsl(var(--m-bg-1))",
                  boxShadow: "0 4px 16px -4px hsl(var(--emerald) / 0.4)",
                }}>
                <Download className="w-3.5 h-3.5" />
                保存邀请海报
              </button>
            </div>
          </div>
        </div>
        <div className="px-5 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-gold" />
            <h2 className="text-base font-extrabold">邀请排行</h2>
          </div>
          <div className="space-y-2">
            {leaderboard.map((item) => (
              <div key={item.rank}
                className={`rounded-xl px-4 py-3 flex items-center gap-3 transition-all ${
                  item.highlight
                    ? "bg-gold/[0.08] border border-gold/15 ring-1 ring-inset ring-gold/10"
                    : "bg-[hsl(var(--m-surface)_/_0.35)] border border-[hsl(var(--m-surface-border)_/_0.2)]"
                }`}>
                <span className="text-base w-6 text-center">
                  {item.medal || <span className="text-xs font-bold text-[hsl(var(--m-text-dim))]">#{item.rank}</span>}
                </span>
                <span className={`flex-1 text-sm font-bold ${item.highlight ? "text-gold-soft" : ""}`}>
                  {item.name}
                </span>
                <span className="text-xs font-bold text-[hsl(var(--m-text-dim))] tabular-nums">
                  {item.count} <span className="text-[10px]">人</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Rules ── */}
        <div className="px-5 mb-8">
          <div className="rounded-2xl p-4 bg-[hsl(var(--m-surface)_/_0.25)] border border-[hsl(var(--m-surface-border)_/_0.15)]">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-emerald" />
              <span className="text-xs font-bold">活动规则</span>
            </div>
            <ul className="space-y-2">
              {[
                "好友通过你的专属链接注册后自动触发奖励",
                "双方各获得 10 次免费抽奖机会",
                "邀请人数不设上限，多邀多得",
                "奖励在好友注册成功后实时到账",
                "恶意刷号将取消奖励资格",
              ].map((rule, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[11px] text-[hsl(var(--m-text-dim))] leading-relaxed">
                  <ArrowRight className="w-3 h-3 mt-0.5 shrink-0 text-emerald/50" />
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="h-8" />
      </div>
    </MemberLayout>
  );
}
