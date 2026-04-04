import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Share2,
  Copy,
  Info,
  Zap,
  Users,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  ArrowRight,
  QrCode,
  Download,
  CheckCircle,
} from "lucide-react";
import { saveInvitePosterPngBlob } from "@/lib/memberInvitePosterSave";
import { QRCodeSVG } from "qrcode.react";
import { cn } from "@/lib/utils";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useMemberPortalSettings } from "@/hooks/useMemberPortalSettings";
import { getPosterFrame, drawInvitePoster } from "@/lib/invitePosterFrames";
import { useMemberPoints } from "@/hooks/useMemberPoints";
import { useLanguage } from "@/contexts/LanguageContext";
import { MemberInviteHero } from "@/components/member/MemberInviteHero";
import { notify } from "@/lib/notifyHub";
import { fetchMemberInviteToken } from "@/services/memberPortal/memberInvitePortalService";
import { ROUTES } from "@/routes/constants";
import { memberPortalCopyFailedToast, memberPortalLinkCopiedToast } from "@/lib/memberPortalUx";
import { fireMemberInviteCopyConfetti } from "@/lib/memberPortalConfetti";
import "@/styles/member-portal.css";
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";
import { MemberInviteLeaderboard } from "@/components/member/MemberInviteLeaderboard";
import { useMemberPullRefreshSignal } from "@/hooks/useMemberPullRefreshSignal";

export default function MemberInvite() {
  const { member, refreshMember } = useMemberAuth();
  const { settings: portalSettings } = useMemberPortalSettings(member?.id);
  const { t } = useLanguage();
  const { refresh: refetchInvitePoints } = useMemberPoints(member?.id);
  const [copied, setCopied] = useState(false);
  const [inviteToken, setInviteToken] = useState("");
  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenError, setTokenError] = useState(false);
  const [inviteStatsHydrated, setInviteStatsHydrated] = useState(false);

  /** 与后台「会员门户 → 任务与奖励」邀请奖励一致 */
  const inviteRewardSpins = useMemo(
    () => Math.max(0, Math.floor(Number(portalSettings.invite_reward_spins ?? 0))),
    [portalSettings.invite_reward_spins],
  );
  const dailyInviteRewardLimit = useMemo(
    () => Math.max(0, Math.floor(Number(portalSettings.daily_invite_reward_limit ?? 0))),
    [portalSettings.daily_invite_reward_limit],
  );

  const loadToken = useCallback(() => {
    if (!member?.id) return;
    setTokenLoading(true);
    setTokenError(false);
    fetchMemberInviteToken(member.id)
      .then((tok) => {
        if (tok) setInviteToken(tok);
        setTokenLoading(false);
      })
      .catch(() => {
        setTokenLoading(false);
        setTokenError(true);
      });
  }, [member?.id]);

  useEffect(() => {
    loadToken();
  }, [loadToken]);

  useMemberPullRefreshSignal(() => {
    loadToken();
    void refreshMemberRef.current();
    void refetchInvitePoints();
  });

  /** refreshMember 依赖 member，每次拉完资料会换引用；若放进 deps 会反复把 hydrated 打回 false →「已邀请/已奖励」闪跳 */
  const refreshMemberRef = useRef(refreshMember);
  refreshMemberRef.current = refreshMember;

  useEffect(() => {
    if (!member?.id) return;
    setInviteStatsHydrated(false);
    let cancelled = false;
    void refreshMemberRef.current().finally(() => {
      if (!cancelled) setInviteStatsHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [member?.id]);

  const prefix = String(
    (portalSettings as unknown as { invite_link_prefix?: string }).invite_link_prefix ?? "",
  ).trim();
  const inviteLink = typeof window !== "undefined" && inviteToken ? `${window.location.origin}/invite/${inviteToken}` : "";
  const registerRefLink =
    typeof window !== "undefined" && inviteToken
      ? `${window.location.origin}${ROUTES.MEMBER.REGISTER}?ref=${encodeURIComponent(inviteToken)}`
      : "";

  const copyLink = () => {
    if (!inviteLink) return;
    navigator.clipboard
      .writeText(inviteLink)
      .then(() => {
        setCopied(true);
        fireMemberInviteCopyConfetti();
        notify.success(memberPortalLinkCopiedToast(t));
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        notify.error(memberPortalCopyFailedToast(t));
      });
  };

  const shareWhatsApp = () => {
    if (!inviteLink) return;
    try {
      const prefixText = prefix ? `${prefix}\n` : "";
      const msg = `${prefixText}${t(`加入 ${portalSettings.company_name || "FastGC"}！注册并登录即可获得 ${inviteRewardSpins} 次免费抽奖机会！点击: ${inviteLink}`, `Join ${portalSettings.company_name || "FastGC"}! Register & log in to get ${inviteRewardSpins} free spins to win prizes! Click: ${inviteLink}`)}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
    } catch {
      notify.error(t("无法打开分享页面", "Unable to open share page"));
    }
  };

  const shareTelegram = () => {
    if (!inviteLink) return;
    try {
      const prefixText = prefix ? `${prefix}\n` : "";
      const msg = `${prefixText}Join ${portalSettings.company_name || "FastGC"}! Register & log in to get ${inviteRewardSpins} free spins to win prizes!`;
      window.open(`https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${encodeURIComponent(msg)}`, "_blank", "noopener,noreferrer");
    } catch {
      notify.error(t("无法打开分享页面", "Unable to open share page"));
    }
  };

  const downloadInvitePoster = useCallback(async () => {
    if (!inviteLink) return;
    const svgEl = document.getElementById("member-invite-qr-svg");
    if (!svgEl) {
      notify.error(t("请稍后再试", "Please try again"));
      return;
    }
    const company = portalSettings.company_name || "FastGC";
    const spins = inviteRewardSpins;
    const frame = getPosterFrame(portalSettings.poster_frame_id || "gold");

    const headlineL1 = portalSettings.poster_headline_zh || portalSettings.poster_headline_en
      ? t(portalSettings.poster_headline_zh || "", portalSettings.poster_headline_en || "")
      : "";
    const headlineL2 = "";

    const rawSubtext = portalSettings.poster_subtext_zh || portalSettings.poster_subtext_en
      ? t(
          portalSettings.poster_subtext_zh || "",
          portalSettings.poster_subtext_en || "",
        )
      : "";
    const subtext = rawSubtext.replace(/\{spins\}/g, String(spins));

    const footer = portalSettings.poster_footer_zh || portalSettings.poster_footer_en
      ? t(portalSettings.poster_footer_zh || "", portalSettings.poster_footer_en || "")
      : "";

    const canvas = document.createElement("canvas");

    let customBgImage: HTMLImageElement | null = null;
    if (portalSettings.poster_custom_bg_url) {
      try {
        customBgImage = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = "anonymous";
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("bg load failed"));
          img.src = portalSettings.poster_custom_bg_url!;
        });
      } catch {
        customBgImage = null;
      }
    }

    try {
      await drawInvitePoster(canvas, {
        frame,
        headlineL1,
        headlineL2,
        subtext,
        footerText: footer,
        inviteLink,
        qrSvgElement: svgEl,
        customBgImage,
      });
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            notify.error(t("无法生成图片", "Could not create image"));
            return;
          }
          void saveInvitePosterPngBlob(blob, "invite-poster.png", t);
        },
        "image/png",
        0.95,
      );
    } catch {
      notify.error(t("无法生成图片", "Could not create image"));
    }
  }, [inviteLink, portalSettings, inviteRewardSpins, t]);

  if (!member) return null;
  if (!portalSettings.enable_invite) {
    return (
      <div className="member-page-enter relative m-page-bg flex min-h-dvh flex-col items-center justify-center overflow-hidden p-5 pb-24 lg:px-8">
        <MemberPageAmbientOrbs />
        <div className="relative z-[1] w-full max-w-md space-y-4 lg:max-w-lg">
          <div className="relative overflow-hidden rounded-2xl border border-pu-gold/28 bg-gradient-to-br from-pu-gold/[0.14] via-[hsl(var(--pu-m-surface)/0.38)] to-[hsl(var(--pu-m-surface)/0.2)] p-4 shadow-[0_8px_28px_-12px_hsl(var(--pu-gold)/0.22)]">
            <div className="relative flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pu-gold/20 text-pu-gold-soft shadow-inner">
                <ShieldAlert className="h-5 w-5" strokeWidth={2} aria-hidden />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-extrabold text-[hsl(var(--pu-m-text))]">
                  {t("邀请功能未开放", "Invite is off")}
                </p>
                <p className="text-xs leading-relaxed text-[hsl(var(--pu-m-text-dim))]">
                  {t(
                    "当前门店暂未开启会员邀请，请联系管理员或在后台「会员门户 → 任务与奖励」中开启。",
                    "Invites are disabled for this portal. Ask an admin or enable under Member Portal → Tasks & rewards.",
                  )}
                </p>
              </div>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-2xl border border-dashed border-pu-gold/22 bg-gradient-to-b from-pu-gold/[0.08] via-[hsl(var(--pu-m-surface)/0.2)] to-[hsl(var(--pu-m-surface)/0.26)] px-5 py-8 text-center">
            <div className="relative">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-pu-gold/12 text-[hsl(var(--pu-m-text-dim)/0.45)]">
                <Users className="h-6 w-6" strokeWidth={1.75} aria-hidden />
              </div>
              <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">
                {t("邀请计划暂不可用", "Invite program unavailable")}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const steps: {
    step: string;
    title: string;
    desc: string;
    color: "--pu-gold" | "--pu-emerald" | "--pu-gold-deep";
    colorSoft: "--pu-gold-soft" | "--pu-emerald-soft";
    emoji: string;
  }[] = [
    {
      step: "01",
      title: t("分享专属链接", "Share your link"),
      desc: t("将你的邀请链接发送给好友", "Send your invite link to friends"),
      color: "--pu-gold",
      colorSoft: "--pu-gold-soft",
      emoji: "📤",
    },
    {
      step: "02",
      title: t("好友注册并登录", "Friend registers & logs in"),
      desc: t("对方通过你的专属链接注册并首次登录", "They sign up via your link and log in for the first time"),
      color: "--pu-emerald",
      colorSoft: "--pu-emerald-soft",
      emoji: "✅",
    },
    {
      step: "03",
      title: t("双方领取奖励", "Both get rewards"),
      desc: t(`各得 ${inviteRewardSpins} 次转盘`, `Each gets ${inviteRewardSpins} wheel spins`),
      color: "--pu-gold-deep",
      colorSoft: "--pu-gold-soft",
      emoji: "🎁",
    },
  ];

  return (
    <div className="member-page-enter relative m-page-bg flex min-h-full flex-col pb-28 lg:mx-auto lg:w-full lg:max-w-[960px] lg:px-6 lg:py-6">
      {/* Hero — boost: soft orbs + title row */}
      <div className="relative overflow-hidden">
        <MemberPageAmbientOrbs />

        <div className="relative z-[1] px-4 pb-2 pt-7 sm:px-5 lg:pt-8">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-pu-emerald to-pu-emerald-soft">
                <Users className="h-4 w-4 text-[hsl(var(--pu-m-bg-1))]" strokeWidth={2.25} aria-hidden />
              </div>
              <h1 className="text-xl font-extrabold tracking-tight text-[hsl(var(--pu-m-text))]">
                {t("邀请计划", "Invite program")}
              </h1>
            </div>
          </div>
          <p className="text-xs font-medium leading-relaxed text-[hsl(var(--pu-m-text-dim))]">
            {t("邀请好友加入，双方各得", "Invite friends to join — both get")}{" "}
            <span className="font-bold tabular-nums text-pu-emerald-soft">{inviteRewardSpins}</span>
            {t(" 次抽奖机会", inviteRewardSpins === 1 ? " draw chance" : " draw chances")}
          </p>
        </div>
      </div>

      <MemberInviteHero
        invitedSuccessCount={member.invite_success_lifetime_count ?? 0}
        lifetimeRewardSpins={member.invite_lifetime_reward_spins ?? 0}
        statsLoading={!inviteStatsHydrated}
        t={t}
      />

      <div className="relative z-[1] flex flex-1 flex-col px-4 sm:px-5">
        <MemberInviteLeaderboard t={t} />

        {/* 运作流程 — boost: vertical STEP cards */}
        <div className="mb-6">
          <h2 className="mb-5 text-center text-base font-extrabold text-[hsl(var(--pu-m-text))]">
            {t("运作流程", "How it works")}
          </h2>
          <div className="space-y-3">
            {steps.map((item, i) => (
              <div key={item.step} className="relative">
                {i < steps.length - 1 ? (
                  <div
                    className="absolute -bottom-3 left-1/2 z-0 h-3 w-[2px] -translate-x-1/2"
                    style={{
                      background: `linear-gradient(to bottom, hsl(var(${item.color}) / 0.3), hsl(var(${item.color}) / 0.05))`,
                    }}
                  />
                ) : null}
                <div
                  className="relative rounded-2xl p-4 text-center transition-transform hover:scale-[1.01]"
                  style={{
                    background: `linear-gradient(135deg, hsl(var(${item.color}) / 0.06), hsl(var(--pu-m-surface) / 0.4))`,
                    border: `1px solid hsl(var(${item.color}) / 0.12)`,
                  }}
                >
                  <div
                    className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[10px] font-extrabold tracking-widest"
                    style={{
                      background: `hsl(var(${item.color}) / 0.15)`,
                      color: `hsl(var(${item.colorSoft}))`,
                      border: `1px solid hsl(var(${item.color}) / 0.2)`,
                    }}
                  >
                    STEP {item.step}
                  </div>
                  <div className="mb-2 mt-2 text-2xl">{item.emoji}</div>
                  <p className="mb-1 text-sm font-extrabold text-[hsl(var(--pu-m-text))]">{item.title}</p>
                  <p className="text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim))]">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 专属链接 — boost: m-glass + 内联复制 + 分享 */}
        <div id="member-invite-link-anchor" className="mb-6 scroll-mt-24">
          <div className="m-glass relative overflow-hidden rounded-2xl p-5">
            <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-gold/[0.05] to-pu-emerald/[0.03]" />
            <div className="relative space-y-4">
              <h3 className="text-sm font-extrabold text-[hsl(var(--pu-m-text))]">
                {t("你的专属链接", "Your invite link")}
              </h3>
              <div className="flex items-center gap-2">
                <div className="min-h-[44px] flex-1 truncate rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.3)] bg-[hsl(var(--pu-m-bg-1)/0.7)] px-3.5 py-3 font-mono text-xs text-[hsl(var(--pu-m-text-dim))]">
                  {tokenLoading ? (
                    <span className="text-[hsl(var(--pu-m-text-dim)/0.45)]">{t("加载链接中…", "Loading link…")}</span>
                  ) : tokenError ? (
                    <span className="flex items-center gap-2 text-red-400">
                      {t("加载失败", "Failed to load link")}
                      <button
                        type="button"
                        onClick={loadToken}
                        className="inline-flex cursor-pointer items-center gap-1 border-none bg-transparent text-xs font-semibold text-pu-gold"
                      >
                        <RefreshCw size={11} /> {t("重试", "Retry")}
                      </button>
                    </span>
                  ) : (
                    inviteLink
                  )}
                </div>
                <button
                  type="button"
                  disabled={!inviteLink || tokenLoading}
                  onClick={copyLink}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all active:scale-90 disabled:opacity-40"
                  style={{
                    background: copied
                      ? "hsl(var(--pu-emerald))"
                      : "linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
                    boxShadow: copied
                      ? "0 4px 16px -4px hsl(var(--pu-emerald) / 0.5)"
                      : "0 4px 16px -4px hsl(var(--pu-gold) / 0.5)",
                  }}
                  aria-label={t("复制邀请链接", "Copy invite link")}
                >
                  {copied ? (
                    <CheckCircle className="h-4 w-4 text-[hsl(var(--pu-m-bg-1))]" aria-hidden />
                  ) : (
                    <Copy className="h-4 w-4 text-[hsl(var(--pu-m-bg-1))]" aria-hidden />
                  )}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={!inviteLink}
                  onClick={shareWhatsApp}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl border py-3 text-xs font-bold transition-all active:scale-95",
                    inviteLink
                      ? "border-[hsl(var(--pu-m-surface-border)/0.3)] bg-[hsl(var(--pu-m-surface)/0.7)] hover:border-pu-emerald/30 hover:bg-pu-emerald/[0.06]"
                      : "cursor-not-allowed opacity-40",
                  )}
                >
                  <Share2 className="h-3.5 w-3.5 text-pu-emerald-soft" aria-hidden />
                  <span className="text-[hsl(var(--pu-m-text))]">WhatsApp</span>
                </button>
                <button
                  type="button"
                  disabled={!inviteLink}
                  onClick={shareTelegram}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-xl border py-3 text-xs font-bold transition-all active:scale-95",
                    inviteLink
                      ? "border-[hsl(var(--pu-m-surface-border)/0.3)] bg-[hsl(var(--pu-m-surface)/0.7)] hover:border-[hsl(200_80%_50%)/0.35] hover:bg-[hsl(200_80%_50%)/0.06]"
                      : "cursor-not-allowed opacity-40",
                  )}
                >
                  <Send className="h-3.5 w-3.5 text-[hsl(200_70%_60%)]" aria-hidden />
                  <span className="text-[hsl(var(--pu-m-text))]">Telegram</span>
                </button>
              </div>
              {registerRefLink ? (
                <p className="m-0 text-[10px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.75)]">
                  {t("注册页（带推荐码）", "Registration URL (with ref)")}:{" "}
                  <span className="break-all font-mono text-[hsl(var(--pu-m-text-dim))]">{registerRefLink}</span>
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {/* 二维码 — boost */}
        {inviteLink ? (
          <div className="mb-6">
            <div className="m-glass relative overflow-hidden rounded-2xl p-5">
              <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-emerald/[0.04] to-pu-gold/[0.03]" />
              <div className="relative">
                <div className="mb-4 flex items-center gap-2">
                  <QrCode className="h-4 w-4 text-pu-emerald" aria-hidden />
                  <h3 className="text-sm font-extrabold text-[hsl(var(--pu-m-text))]">
                    {t("二维码邀请", "QR invite")}
                  </h3>
                </div>
                <p className="mb-4 text-[11px] text-[hsl(var(--pu-m-text-dim))]">
                  {t("让好友扫描下方二维码直接注册", "Friends can scan to register")}
                </p>
                <div className="mb-4 flex justify-center">
                  <div className="rounded-2xl bg-[hsl(var(--pu-m-text))] p-3">
                    <QRCodeSVG
                      id="member-invite-qr-svg"
                      value={inviteLink}
                      size={160}
                      level="M"
                      bgColor="hsl(210, 40%, 98%)"
                      fgColor="hsl(216, 50%, 8%)"
                      includeMargin={false}
                    />
                  </div>
                </div>
                <p className="mb-3 truncate text-center font-mono text-[10px] text-[hsl(var(--pu-m-text-dim)/0.55)]">
                  {inviteLink}
                </p>
                <button
                  type="button"
                  onClick={downloadInvitePoster}
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-xs font-bold text-[hsl(var(--pu-m-bg-1))] transition-all active:scale-95"
                  style={{
                    background: "linear-gradient(135deg, hsl(var(--pu-emerald)), hsl(var(--pu-emerald-soft)))",
                    boxShadow: "0 4px 16px -4px hsl(var(--pu-emerald) / 0.4)",
                  }}
                >
                  <Download className="h-3.5 w-3.5" aria-hidden />
                  {t("保存邀请海报", "Save invite poster")}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* 规则 — boost: Shield + ArrowRight */}
        <div className="mb-8 rounded-2xl border border-[hsl(var(--pu-m-surface-border)/0.15)] bg-[hsl(var(--pu-m-surface)/0.25)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 shrink-0 text-pu-emerald" aria-hidden />
            <span className="text-xs font-bold text-[hsl(var(--pu-m-text))]">{t("活动规则", "Rules")}</span>
          </div>
          <ul className="m-0 space-y-2 p-0">
            {[
              t("好友通过你的链接注册后触发奖励", "Rewards trigger when a friend registers via your link"),
              t(`双方各得 ${inviteRewardSpins} 次免费转盘`, `Both sides get ${inviteRewardSpins} free spins`),
              dailyInviteRewardLimit > 0
                ? t(`每日邀请奖励上限：${dailyInviteRewardLimit}`, `Daily invite reward cap: ${dailyInviteRewardLimit}`)
                : t("邀请次数不限", "No cap on invites"),
              t("好友注册并首次登录后系统自动发放奖励", "Rewards are granted automatically after the friend registers and logs in"),
              t(
                "此为会员邀请新会员；若需注册员工账号，请使用管理员提供的员工邀请码，勿混用本链接。",
                "This link invites new members only. For staff accounts, use invitation codes from your admin—not this link.",
              ),
            ].map((rule, i) => (
              <li key={i} className="flex list-none items-start gap-2.5 text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim))]">
                <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-pu-emerald/50" aria-hidden />
                {rule}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-start gap-2 rounded-2xl border border-pu-gold/20 bg-pu-gold/[0.06] p-4">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-pu-gold-soft" strokeWidth={2} aria-hidden />
          <p className="m-0 text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim))]">
            <Zap className="mr-1 inline h-3 w-3 text-pu-gold-soft" aria-hidden />
            {t(
              "分享你的专属链接，好友注册并首次登录后，双方各得转盘抽奖机会。恶意刷号将取消奖励资格。",
              "Share your link; after a friend registers and logs in for the first time, both of you get wheel spins. Abuse may void rewards.",
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
