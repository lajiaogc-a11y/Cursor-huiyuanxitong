import { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Gift,
  Users,
  CheckCircle,
  Share2,
  Star,
  Info,
  ShieldCheck,
  Megaphone,
  Sparkles,
  Loader2,
  Wallet,
  ChevronRight,
  Settings,
  Bell,
  Sun,
  Moon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useMemberPointsBreakdown } from "@/hooks/useMemberPointsBreakdown";
import { useMemberSpinQuota } from "@/hooks/useMemberSpinQuota";
import { useMemberPortalSettings } from "@/hooks/useMemberPortalSettings";
import { useMemberDashboardDailyTasks } from "@/hooks/useMemberDashboardDailyTasks";
import { fetchMemberInviteToken } from "@/services/memberPortal/memberInvitePortalService";
import { fetchMemberInboxUnreadCount } from "@/services/memberPortal/memberInboxService";
import { ROUTES } from "@/routes/constants";
import { stashPointsHashBeforeInviteNavigation } from "@/lib/memberPortalInviteReturn";
import type { AnnouncementItem, AnnouncementPopupFrequency } from "@/services/members/memberPortalSettingsService";
import { useMemberResolvableMedia } from "@/hooks/useMemberResolvableMedia";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import "@/styles/member-portal.css";
import { MemberHomeBannerModule } from "@/components/member/MemberHomeBannerModule";
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";
import { MemberPointsValueSkeleton } from "@/components/member/MemberPageLoadingShell";
import { useMemberSkeletonGate } from "@/hooks/useMemberSkeletonGate";
import { resolveHomePointsBalanceFooter } from "@/lib/memberPortalBilingualHint";
import { useMemberLocalAvatar } from "@/hooks/useMemberLocalAvatar";
import { getMemberPortalDisplayName } from "@/lib/memberDisplayName";
import { displayMemberLevelLabel } from "@/lib/memberLevelDisplay";
import { getMemberPointsLedgerRpc } from "@/services/points/memberPointsRpcService";
import { sumTodayEarnedFromLedger } from "@/lib/memberLedgerToday";
import { formatAnnouncementPublishedAt } from "@/lib/memberPortalAnnouncementDate";
import { useMemberAnimatedCount } from "@/hooks/useMemberAnimatedCount";
import { useMemberPullRefreshSignal } from "@/hooks/useMemberPullRefreshSignal";
import {
  getMemberInboxUnreadCount,
  setMemberInboxUnreadCount,
  subscribeMemberInboxUnreadCount,
} from "@/lib/memberInboxUnreadStore";

/** 与 premium-ui-boost 一致：后台未配 home_banners 时的本地三轮播（文案 i18n） */
function useFallbackHomeBannerSlides(t: (zh: string, en: string) => string) {
  return useMemo(
    () => [
      {
        title: t("春季积分狂欢", "Spring points festival"),
        desc: t("消费满 500 积分翻倍，限时 3 天", "Spend 500 pts — double points, 3 days only"),
        gradient: "linear-gradient(135deg, hsl(219 40% 14%), hsl(216 50% 8%))",
        accent: "--pu-gold" as const,
      },
      {
        title: t("邀请好友赢大奖", "Invite friends — win big"),
        desc: t("每邀请 1 人即得 10 次免费抽奖", "Each invite earns 10 free lucky draws"),
        gradient: "linear-gradient(135deg, hsl(252 35% 14%), hsl(216 50% 8%))",
        accent: "--pu-violet" as const,
      },
      {
        title: t("新品上架通知", "New arrivals"),
        desc: t("限量版商品已上线积分商城", "Limited items are live in the points mall"),
        gradient: "linear-gradient(135deg, hsl(219 50% 16%), hsl(216 50% 8%))",
        accent: "--pu-gold-deep" as const,
      },
    ],
    [t],
  );
}

function localCalendarDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function announcementPopupContentFingerprint(title: string, body: string | null | undefined): string {
  const s = `${String(title ?? "")}\n${String(body ?? "")}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function MemberAnnouncementDrawerImage({ stableKey, rawUrl }: { stableKey: string; rawUrl: string }) {
  const { resolvedSrc, usePlaceholder, onImageError } = useMemberResolvableMedia(stableKey, rawUrl);
  return (
    <div className="mb-3 w-full overflow-hidden rounded-xl">
      {usePlaceholder ? (
        <div
          className="flex h-[min(220px,40vw)] w-full min-h-[120px] items-center justify-center bg-gradient-to-br from-pu-gold/12 to-pu-gold/[0.06]"
          role="img"
          aria-hidden
        >
          <Megaphone className="h-10 w-10 text-[hsl(var(--pu-m-text-dim)/0.35)]" strokeWidth={1.5} />
        </div>
      ) : (
        <img
          src={resolvedSrc}
          alt=""
          className="max-h-[220px] w-full object-cover"
          onError={onImageError}
        />
      )}
    </div>
  );
}

export default function MemberDashboard() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { t, language } = useLanguage();
  const { member, signOut, refreshMember } = useMemberAuth();
  const { breakdown, loading, error: pointsError, refresh: refreshPoints } = useMemberPointsBreakdown(member?.id);
  const { remaining: spinRemaining, error: spinError, refresh: refreshSpinQuota } = useMemberSpinQuota(member?.id);
  const { settings: ps } = useMemberPortalSettings(member?.id);
  const showMemberInbox = !!ps.enable_member_inbox;
  const [popupOpen, setPopupOpen] = useState(false);
  const fallbackBannerSlides = useFallbackHomeBannerSlides(t);
  const [fallbackBannerIdx, setFallbackBannerIdx] = useState(0);
  const [fallbackBannerSliding, setFallbackBannerSliding] = useState(false);
  const [todayEarned, setTodayEarned] = useState(0);
  const [todayEarnedLoading, setTodayEarnedLoading] = useState(true);
  const [pullRefreshGen, setPullRefreshGen] = useState(0);

  useMemberPullRefreshSignal(() => {
    setPullRefreshGen((g) => g + 1);
  });

  useEffect(() => {
    setPullRefreshGen(0);
  }, [member?.id]);

  const themeColor = useMemo(() => {
    const c = String(ps.theme_primary_color || "").trim();
    return /^#[0-9A-Fa-f]{6}$/i.test(c) ? c : "#4d8cff";
  }, [ps.theme_primary_color]);

  const homePointsBalanceFooter = useMemo(
    () =>
      resolveHomePointsBalanceFooter(
        language,
        ps.home_points_balance_hint_zh,
        ps.home_points_balance_hint_en,
        "与账户可用余额一致（兑换可能分桶占用）。",
        "Matches account balance (redemptions split across buckets).",
      ),
    [language, ps.home_points_balance_hint_en, ps.home_points_balance_hint_zh],
  );

  const pointsPopoverMallNote = useMemo(
    () =>
      t(
        "积分商城为自助兑换，无需客服人工处理订单。",
        "Redeem gifts in Points Mall — self-service; support staff are not required to process mall orders.",
      ),
    [t],
  );

  const buildShareInviteText = useCallback(
    (link: string) =>
      `Join ${ps.company_name || "FastGC"}! Register to get ${ps.invite_reward_spins} free spins to win prizes! Click: ${link}`,
    [ps.company_name, ps.invite_reward_spins],
  );

  const announcementPopupFreq = useMemo((): AnnouncementPopupFrequency => {
    const f = ps.announcement_popup_frequency;
    if (f === "daily_first" || f === "every_login" || f === "off") return f;
    return ps.show_announcement_popup ? "every_login" : "off";
  }, [ps.announcement_popup_frequency, ps.show_announcement_popup]);

  const announcementPopupBody = useMemo(
    () => String(ps.announcement_popup_content || "").trim(),
    [ps.announcement_popup_content],
  );

  const announcementFp = useMemo(
    () => announcementPopupContentFingerprint(ps.announcement_popup_title || "", ps.announcement_popup_content),
    [ps.announcement_popup_title, ps.announcement_popup_content],
  );

  const onAnnouncementPopupClose = useCallback(() => {
    if (member?.id && announcementPopupFreq === "daily_first" && announcementPopupBody) {
      const dayKey = `member_ann_popup_day_${member.id}_${localCalendarDateKey()}_${announcementFp}`;
      try {
        localStorage.setItem(dayKey, "1");
      } catch {
        /* ignore */
      }
    }
    setPopupOpen(false);
  }, [member?.id, announcementPopupFreq, announcementPopupBody, announcementFp]);

  useEffect(() => {
    if (!member?.id || announcementPopupFreq === "off" || !announcementPopupBody) return;

    const sessKey = `member_ann_popup_sess_${member.id}_${announcementFp}`;

    if (announcementPopupFreq === "every_login") {
      try {
        if (sessionStorage.getItem(sessKey)) return;
        setPopupOpen(true);
        sessionStorage.setItem(sessKey, "1");
      } catch {
        setPopupOpen(true);
      }
      return;
    }

    if (announcementPopupFreq === "daily_first") {
      const dayKey = `member_ann_popup_day_${member.id}_${localCalendarDateKey()}_${announcementFp}`;
      try {
        if (localStorage.getItem(dayKey)) return;
        setPopupOpen(true);
      } catch {
        setPopupOpen(true);
      }
    }
  }, [member?.id, announcementPopupFreq, announcementPopupBody, announcementFp]);

  const [inviteToken, setInviteToken] = useState("");
  useEffect(() => {
    if (!member?.id) return;
    let cancelled = false;
    fetchMemberInviteToken(member.id)
      .then((tok) => {
        if (!cancelled && tok) setInviteToken(tok);
      })
      .catch(() => { /* invite token fetch is non-critical */ });
    return () => {
      cancelled = true;
    };
  }, [member?.id]);

  const {
    checkedInToday,
    checkingIn,
    shareClaimedToday,
    claimingShare,
    checkInSummary,
    handleCheckIn,
    handleShareAndClaim,
  } = useMemberDashboardDailyTasks({
    memberId: member?.id,
    inviteToken,
    invitePathFallback: member?.member_code || "",
    buildShareInviteText,
    refreshMember,
    refreshPoints,
    refreshSpinQuota,
  });

  const totalStaffRemaining = breakdown.balance;
  const pendingMallFrozen = breakdown.pending_mall_points;
  const availablePointsHome = Math.max(
    0,
    Math.round((totalStaffRemaining - pendingMallFrozen) * 100) / 100,
  );
  const ptsTilesAnimOn = Boolean(member) && !loading && !pointsError;
  const animDashTotal = useMemberAnimatedCount(totalStaffRemaining, { enabled: ptsTilesAnimOn, durationMs: 780 });
  const animDashAvail = useMemberAnimatedCount(availablePointsHome, { enabled: ptsTilesAnimOn, durationMs: 880 });
  const animDashFrozen = useMemberAnimatedCount(pendingMallFrozen, { enabled: ptsTilesAnimOn, durationMs: 980 });
  const animDashToday = useMemberAnimatedCount(todayEarned, {
    enabled: Boolean(member) && !todayEarnedLoading,
    durationMs: 820,
  });
  const animReferralCount = useMemberAnimatedCount(breakdown.referral_count, {
    enabled: ptsTilesAnimOn,
    durationMs: 700,
  });
  const animConsumptionPts = useMemberAnimatedCount(breakdown.consumption_points, {
    enabled: ptsTilesAnimOn,
    durationMs: 720,
  });
  const animBucketReferralPts = useMemberAnimatedCount(breakdown.referral_points, {
    enabled: ptsTilesAnimOn,
    durationMs: 740,
  });
  const animLotteryPts = useMemberAnimatedCount(breakdown.lottery_points, {
    enabled: ptsTilesAnimOn,
    durationMs: 760,
  });

  const showPointsSkeleton = useMemberSkeletonGate(loading);
  const showTodayEarnedSkeleton = useMemberSkeletonGate(todayEarnedLoading);
  const showCheckInSublineSkeleton = useMemberSkeletonGate(!checkInSummary);

  const announcementItems = useMemo((): AnnouncementItem[] => {
    const fromList = Array.isArray(ps.announcements)
      ? ps.announcements.filter(
          (a) =>
            (a.title && a.title.trim()) ||
            (a.content && a.content.trim()) ||
            (a.image_url && String(a.image_url).trim()),
        )
      : [];
    if (fromList.length > 0) return fromList;
    if (ps.announcement?.trim()) {
      return [{ title: "", content: ps.announcement.trim(), sort_order: 1, image_url: "" }];
    }
    return [];
  }, [ps.announcements, ps.announcement]);

  const [selectedAnn, setSelectedAnn] = useState<AnnouncementItem | null>(null);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [pointsInfoOpen, setPointsInfoOpen] = useState(false);

  const showSpin = !!ps.enable_spin;
  const showInvite = !!ps.enable_invite;
  const showCheckIn = !!ps.enable_check_in;
  const showShare = !!ps.enable_share_reward;
  const dailyTaskRowsTotal =
    (showCheckIn ? 1 : 0) + (showShare ? 1 : 0) + (showInvite ? 1 : 0) + 1;
  const dailyTaskRowsDone =
    (showCheckIn && checkedInToday ? 1 : 0) + (showShare && shareClaimedToday ? 1 : 0);

  const nextFallbackBanner = useCallback(() => {
    setFallbackBannerSliding(true);
    window.setTimeout(() => {
      setFallbackBannerIdx((i) => (i + 1) % fallbackBannerSlides.length);
      setFallbackBannerSliding(false);
    }, 300);
  }, [fallbackBannerSlides.length]);

  useEffect(() => {
    if (Array.isArray(ps.home_banners) && ps.home_banners.length > 0) return;
    const timer = window.setInterval(nextFallbackBanner, 4000);
    return () => window.clearInterval(timer);
  }, [nextFallbackBanner, ps.home_banners]);

  useEffect(() => {
    if (!member?.id) return;
    let cancelled = false;
    setTodayEarnedLoading(true);
    void (async () => {
      const r = await getMemberPointsLedgerRpc(member.id, "all", 200, 0);
      if (cancelled) return;
      if (r.success) setTodayEarned(sumTodayEarnedFromLedger(r.rows));
      else setTodayEarned(0);
      setTodayEarnedLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [member?.id, checkedInToday, shareClaimedToday]);

  /** 下拉刷新：静默更新「今日获得」避免与 React Query 并发时再闪一屏骨架 */
  useEffect(() => {
    if (!member?.id || pullRefreshGen === 0) return;
    let cancelled = false;
    void (async () => {
      const r = await getMemberPointsLedgerRpc(member.id, "all", 200, 0);
      if (cancelled) return;
      if (r.success) setTodayEarned(sumTodayEarnedFromLedger(r.rows));
      else setTodayEarned(0);
    })();
    return () => {
      cancelled = true;
    };
  }, [member?.id, pullRefreshGen]);

  const { avatarUrl: homeAvatarUrl } = useMemberLocalAvatar(member?.id, member?.avatar_url, () => {
    void refreshMember();
  });
  const {
    resolvedSrc: homeAvatarResolvedSrc,
    usePlaceholder: homeAvatarUsePlaceholder,
    onImageError: onHomeAvatarImageError,
  } = useMemberResolvableMedia(
    `member-dashboard-avatar-${member?.id ?? "anon"}`,
    homeAvatarUrl || undefined,
  );
  const showHomeAvatarImg = Boolean(homeAvatarUrl && !homeAvatarUsePlaceholder);

  const [notificationUnreadCount, setNotificationUnreadCount] = useState(() => getMemberInboxUnreadCount());
  useEffect(() => {
    setNotificationUnreadCount(getMemberInboxUnreadCount());
    return subscribeMemberInboxUnreadCount(() => {
      setNotificationUnreadCount(getMemberInboxUnreadCount());
    });
  }, []);

  useEffect(() => {
    if (!member?.id) return;
    if (!showMemberInbox) {
      setMemberInboxUnreadCount(0);
      return;
    }
    void (async () => {
      try {
        const n = await fetchMemberInboxUnreadCount();
        setMemberInboxUnreadCount(n);
      } catch {
        /* keep badge as-is */
      }
    })();
  }, [member?.id, pullRefreshGen, showMemberInbox]);

  if (!member) return null;

  const portalDisplayName =
    getMemberPortalDisplayName({
      nickname: member.nickname,
      memberCode: member.member_code,
      phoneNumber: member.phone_number,
    }).trim() || t("会员", "Member");
  const tierDisplay =
    displayMemberLevelLabel(member.member_level, member.member_level_zh, language) ||
    t("VIP 会员", "VIP Member");
  const avatarLetter =
    portalDisplayName.trim().slice(0, 1).toUpperCase() ||
    (member.member_code?.trim().slice(0, 1).toUpperCase() ?? "M");

  const fmtPts = (n: number) =>
    Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const memberPointsInfoPanel = (
    <div className="text-xs leading-relaxed text-[hsl(var(--pu-m-text)/0.92)]">
      <div>
        {t("总积分（活动数据剩余）", "Total points (activity remaining)")}:{" "}
        <b>{fmtPts(animDashTotal)}</b>
      </div>
      <div>
        {t("可用积分", "Available points")}: <b>{fmtPts(animDashAvail)}</b>
      </div>
      <div>
        {t("冻结积分（待审核兑换）", "Frozen (pending mall)")}: <b>{fmtPts(animDashFrozen)}</b>
      </div>
      <div>
        {t("推荐人数", "Referrals")}: <b>{Math.round(animReferralCount).toLocaleString()}</b>
      </div>
      <div className="mt-2 text-[11px] text-[hsl(var(--pu-m-text-dim))]">
        {t("分类占比（用于展示）", "Bucket mix (display)")}
      </div>
      <div>
        {t("消费", "Consumption")}: <b>{fmtPts(animConsumptionPts)}</b>
      </div>
      <div>
        {t("推荐", "Referral")}: <b>{fmtPts(animBucketReferralPts)}</b>
      </div>
      <div>
        {t("抽奖", "Lottery")}: <b>{fmtPts(animLotteryPts)}</b>
      </div>
      <div className="mt-2 border-t border-[hsl(var(--pu-m-surface-border)/0.22)] pt-2 text-[hsl(var(--pu-m-text-dim)/0.95)] [word-break:break-word] [white-space:pre-wrap]">
        {homePointsBalanceFooter}
      </div>
      <div className="mt-2 border-t border-[hsl(var(--pu-m-surface-border)/0.22)] pt-2 text-[hsl(var(--pu-m-text-dim)/0.95)]">
        {pointsPopoverMallNote}
      </div>
      <div style={{ marginTop: 10 }}>
        <Link
          to={ROUTES.MEMBER.POINTS}
          style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: themeColor, textDecoration: "none" }}
        >
          {t("进入积分商城", "Open Points Mall")} →
        </Link>
      </div>
    </div>
  );

  const taskRowBase =
    "rounded-xl p-4 flex items-center justify-between transition-all duration-200 gap-3";
  const taskRowDone =
    "bg-pu-emerald/[0.07] border border-pu-emerald/10 ring-1 ring-inset ring-pu-emerald/10";
  const taskRowTodo =
    "bg-[hsl(var(--pu-m-surface)/0.4)] border border-[hsl(var(--pu-m-surface-border)/0.3)]";

  /* premium-ui-boost 风格每日任务列表（首笔交易跳转联系客服页） */
  const tasksSection = (
    <div key="tasks" className="w-full">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-extrabold text-[hsl(var(--pu-m-text))]">{t("每日任务", "Daily tasks")}</h3>
        <span className="text-[11px] font-bold text-[hsl(var(--pu-m-text-dim))]">
          {dailyTaskRowsDone}/{dailyTaskRowsTotal} {t("已完成", "done")}
        </span>
      </div>
      <div className="space-y-2.5">
        {showCheckIn ? (
          <div className={`${taskRowBase} ${checkedInToday ? taskRowDone : taskRowTodo}`}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-lg shrink-0" aria-hidden>
                ✅
              </span>
              <div className="min-w-0">
                <div className={`text-sm font-bold ${checkedInToday ? "text-pu-emerald-soft" : "text-[hsl(var(--pu-m-text))]"}`}>
                  {t("每日签到", "Daily check-in")}
                </div>
                <div className="text-[11px] font-medium text-[hsl(var(--pu-m-text-dim))]">
                  {showCheckInSublineSkeleton ? (
                    <span className="inline-flex items-center gap-2" role="status" aria-label={t("加载中…", "Loading…")}>
                      <span className="sr-only">{t("加载中…", "Loading…")}</span>
                      <span
                        className="inline-block h-3 w-[8.5rem] max-w-[70vw] animate-pulse rounded-md bg-[hsl(var(--pu-m-surface)/0.38)] motion-reduce:animate-none"
                        aria-hidden
                      />
                    </span>
                  ) : checkedInToday ? (
                    t(
                      `已连续 ${checkInSummary.current_streak_days ?? 0} 天 · 明日 +${checkInSummary.next_credits ?? 0} 次转盘`,
                      `${checkInSummary.current_streak_days ?? 0} day streak · tomorrow +${checkInSummary.next_credits ?? 0} spins`,
                    )
                  ) : (
                    t(
                      `第 ${checkInSummary.next_sign_in_streak_day ?? 1} 天 · ${checkInSummary.next_credits ?? 0} 次转盘`,
                      `Day ${checkInSummary.next_sign_in_streak_day ?? 1} · ${checkInSummary.next_credits ?? 0} spins`,
                    )
                  )}
                </div>
              </div>
            </div>
            {checkedInToday ? (
              <CheckCircle className="h-5 w-5 shrink-0 text-pu-emerald" aria-hidden />
            ) : (
              <Button
                type="button"
                disabled={checkingIn}
                className="btn-mint shrink-0 rounded-xl border-0 px-4 py-1.5 text-xs active:scale-95"
                onClick={handleCheckIn}
              >
                {checkingIn ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                {t("去完成", "Go")}
              </Button>
            )}
          </div>
        ) : null}

        {showShare ? (
          <div className={`${taskRowBase} ${shareClaimedToday ? taskRowDone : taskRowTodo}`}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-lg shrink-0" aria-hidden>
                📤
              </span>
              <div className="min-w-0">
                <div className={`text-sm font-bold ${shareClaimedToday ? "text-pu-emerald-soft" : "text-[hsl(var(--pu-m-text))]"}`}>
                  {t("分享好友", "Share with friends")}
                </div>
                <div className="text-[11px] font-medium text-[hsl(var(--pu-m-text-dim))]">
                  +{ps.share_reward_spins} {t("次转盘", "spins")}
                  {ps.daily_share_reward_limit > 0 ? ` · ${t("每日上限", "daily cap")} ${ps.daily_share_reward_limit}` : ""}
                </div>
              </div>
            </div>
            {shareClaimedToday ? (
              <CheckCircle className="h-5 w-5 shrink-0 text-pu-emerald" aria-hidden />
            ) : (
              <Button
                type="button"
                disabled={claimingShare}
                className="shrink-0 rounded-xl border-0 bg-[hsl(var(--pu-emerald))] px-4 py-1.5 text-xs font-bold text-[hsl(var(--pu-m-bg-1))] shadow-[0_4px_14px_-4px_hsl(var(--pu-emerald)/0.45)] transition hover:bg-[hsl(var(--pu-emerald-soft))] hover:shadow-[0_6px_18px_-4px_hsl(var(--pu-emerald)/0.4)] active:scale-95 disabled:opacity-60"
                onClick={handleShareAndClaim}
              >
                {claimingShare ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                {t("去完成", "Go")}
              </Button>
            )}
          </div>
        ) : null}

        {showInvite ? (
          <div className={`${taskRowBase} ${taskRowTodo}`}>
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-lg shrink-0" aria-hidden>
                👥
              </span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-[hsl(var(--pu-m-text))]">{t("邀请好友", "Invite friends")}</div>
                <div className="text-[11px] font-medium text-[hsl(var(--pu-m-text-dim))]">
                  {t("双方各得", "Both earn")} +{ps.invite_reward_spins} {t("次转盘", "spins")}
                  {ps.daily_invite_reward_limit > 0 ? ` · ${t("每日上限", "daily cap")} ${ps.daily_invite_reward_limit}` : ""}
                </div>
              </div>
            </div>
            <Button
              asChild
              className="h-auto shrink-0 rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.38)] bg-[hsl(var(--pu-m-surface)/0.55)] px-4 py-1.5 text-xs font-semibold text-[hsl(var(--pu-m-text))] shadow-none hover:bg-[hsl(var(--pu-m-surface)/0.72)] active:scale-95"
            >
              <Link
                to={ROUTES.MEMBER.INVITE}
                onClick={() => stashPointsHashBeforeInviteNavigation(window.location.pathname, window.location.hash)}
              >
                {t("去完成", "Go")}
              </Link>
            </Button>
          </div>
        ) : null}

        <div className={`${taskRowBase} ${taskRowTodo}`}>
          <div className="flex min-w-0 items-center gap-3">
            <span className="text-lg shrink-0" aria-hidden>
              🛒
            </span>
            <div className="min-w-0">
              <div className="text-sm font-bold text-[hsl(var(--pu-m-text))]">{t("完成一笔订单", "Complete an order")}</div>
              <div className="text-[11px] font-medium text-[hsl(var(--pu-m-text-dim))]">
                {t("联系客服完成首笔交易", "Contact support to complete your first trade")}
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn-glow shrink-0 rounded-xl px-4 py-1.5 text-xs active:scale-95"
            style={{
              background: "linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
            }}
            onClick={() => navigate(ROUTES.MEMBER.TRADE_CONTACT)}
          >
            {t("去完成", "Go")}
          </button>
        </div>
      </div>
    </div>
  );

  const securitySection = (
    <div key="security" className="m-trust-footer flex-wrap justify-center gap-x-3 gap-y-2">
      <div className="flex items-center gap-1.5">
        <ShieldCheck className="h-3 w-3 shrink-0 text-[hsl(var(--pu-m-text-dim)/0.55)]" aria-hidden />
        <p className="m-0">
          {ps.footer_text ||
            t("账户数据安全加密，平台合规运营，请放心使用", "Your account data is encrypted; compliant operations — use with confidence.")}
        </p>
      </div>
      <button type="button" className="member-home-signout" onClick={() => setSignOutOpen(true)}>
        {t("退出登录", "Sign out")}
      </button>
    </div>
  );

  const surfaceBtn =
    "rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.3)] bg-[hsl(var(--pu-m-surface)/0.55)] p-2.5 transition motion-reduce:transition-none hover:bg-[hsl(var(--pu-m-surface)/0.85)]";

  return (
    <div className="member-page-enter elite-soft-scroll m-page-bg flex min-h-full flex-col">
      <div className="relative flex-1 overflow-x-hidden">
        <MemberPageAmbientOrbs />
        <div className="relative z-[1] px-5 pb-8 pt-7">
          {/* 与 premium-ui-boost：首屏用户区 + 轮播 + 环境光晕 */}
          <div className="mb-7">
            <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3.5">
              <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-pu-gold to-pu-gold-deep text-lg font-extrabold shadow-pu-glow-gold text-[hsl(var(--pu-primary-foreground))]">
                {showHomeAvatarImg ? (
                  <img
                    src={homeAvatarResolvedSrc}
                    alt=""
                    className="h-full w-full object-cover"
                    onError={onHomeAvatarImageError}
                  />
                ) : (
                  <span className="tabular-nums">{avatarLetter}</span>
                )}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-extrabold text-[hsl(var(--pu-m-text))]">{portalDisplayName}</h2>
                <span className="mt-1 inline-block rounded-full bg-pu-gold/15 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-pu-gold-soft ring-1 ring-inset ring-pu-gold/20">
                  {tierDisplay}
                </span>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" className={surfaceBtn} onClick={toggleTheme} aria-label={t("主题", "Theme")}>
                {theme === "dark" ? (
                  <Sun className="h-5 w-5 text-pu-gold-soft" aria-hidden />
                ) : (
                  <Moon className="h-5 w-5 text-[hsl(var(--pu-m-text-dim))]" aria-hidden />
                )}
              </button>
              {showMemberInbox ? (
                <button
                  type="button"
                  className={`relative ${surfaceBtn}`}
                  onClick={() => navigate(ROUTES.MEMBER.NOTIFICATIONS)}
                  aria-label={t("通知", "Notifications")}
                >
                  <Bell className="h-5 w-5 text-[hsl(var(--pu-m-text-dim))]" aria-hidden />
                  {notificationUnreadCount > 0 ? (
                    <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-0.5 text-[8px] font-extrabold text-white">
                      {notificationUnreadCount > 9 ? "9+" : notificationUnreadCount}
                    </span>
                  ) : null}
                </button>
              ) : null}
              <button
                type="button"
                className={surfaceBtn}
                onClick={() => navigate(ROUTES.MEMBER.SETTINGS)}
                aria-label={t("设置", "Settings")}
              >
                <Settings className="h-5 w-5 text-[hsl(var(--pu-m-text-dim))]" aria-hidden />
              </button>
            </div>
            </div>
          </div>

          {Array.isArray(ps.home_banners) && ps.home_banners.length > 0 ? (
            <div className="mb-5 overflow-hidden rounded-2xl border border-[hsl(var(--pu-m-surface-border)/0.28)] bg-[hsl(var(--pu-m-surface)/0.08)] p-2 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35)]">
              <MemberHomeBannerModule
                banners={ps.home_banners}
                themeColor={themeColor}
                className="mb-0"
                carouselIntervalSec={ps.home_banners_carousel_interval_sec}
              />
            </div>
          ) : (
            <div className="mb-5">
              <div
                className="relative min-h-[120px] overflow-hidden rounded-2xl border border-[hsl(var(--pu-m-surface-border)/0.25)] p-5 pb-4 transition-all duration-300"
                style={{
                  background: fallbackBannerSlides[fallbackBannerIdx].gradient,
                  opacity: fallbackBannerSliding ? 0 : 1,
                  transform: fallbackBannerSliding ? "translateX(-12px)" : "translateX(0)",
                }}
              >
                <div
                  className="pointer-events-none absolute right-0 top-0 h-40 w-40 rounded-full blur-[60px]"
                  style={{
                    background: `hsl(var(${fallbackBannerSlides[fallbackBannerIdx].accent}) / 0.15)`,
                  }}
                  aria-hidden
                />
                <div className="relative">
                  <h3 className="mb-1.5 text-lg font-extrabold text-[hsl(var(--pu-m-text))] drop-shadow-sm">
                    {fallbackBannerSlides[fallbackBannerIdx].title}
                  </h3>
                  <p className="text-sm font-medium leading-relaxed text-[hsl(var(--pu-m-text)/0.75)]">
                    {fallbackBannerSlides[fallbackBannerIdx].desc}
                  </p>
                  <p className="mt-3 flex min-h-[1.25rem] flex-wrap items-center gap-x-1 gap-y-1 text-[11px] font-medium text-[hsl(var(--pu-m-text-dim))]">
                    {showPointsSkeleton ? (
                      <span
                        className="inline-block h-3.5 w-36 max-w-[55vw] animate-pulse rounded-md bg-[hsl(var(--pu-m-surface)/0.38)] motion-reduce:animate-none"
                        aria-hidden
                      />
                    ) : spinError ? (
                      "—"
                    ) : (
                      t(`剩余转盘 ${spinRemaining} 次`, `${spinRemaining} spins left`)
                    )}
                    <span className="opacity-40" aria-hidden>
                      ·
                    </span>
                    {showCheckInSublineSkeleton ? (
                      <span
                        className="inline-block h-3.5 w-24 max-w-[40vw] animate-pulse rounded-md bg-[hsl(var(--pu-m-surface)/0.38)] motion-reduce:animate-none"
                        aria-hidden
                      />
                    ) : (
                      t(
                        `连续 ${checkInSummary?.current_streak_days ?? 0} 天`,
                        `${checkInSummary?.current_streak_days ?? 0}d streak`,
                      )
                    )}
                  </p>
                  <div className="mt-4 flex items-center gap-1.5">
                    {fallbackBannerSlides.map((_, i) => (
                      <button
                        key={i}
                        type="button"
                        aria-label={`${t("活动", "Promo")} ${i + 1}`}
                        onClick={() => {
                          setFallbackBannerSliding(true);
                          window.setTimeout(() => {
                            setFallbackBannerIdx(i);
                            setFallbackBannerSliding(false);
                          }, 300);
                        }}
                        className="rounded-full transition-all duration-300"
                        style={{
                          width: i === fallbackBannerIdx ? 20 : 6,
                          height: 6,
                          background:
                            i === fallbackBannerIdx
                              ? "hsl(var(--pu-m-text))"
                              : "hsl(var(--pu-m-text) / 0.25)",
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {announcementItems.length > 0 ? (
            <div className="m-glass mb-4 flex items-center gap-2.5 overflow-hidden p-3">
              <Megaphone className="h-4 w-4 shrink-0 text-pu-rose-soft" aria-hidden />
              <div className="relative flex-1 overflow-hidden">
                <div
                  className="member-home-ann-track inline-flex w-max items-center animate-[marquee_18s_linear_infinite]"
                  style={{
                    animationDuration: `${Math.max(14, announcementItems.length * 5)}s`,
                  }}
                >
                  {[...announcementItems, ...announcementItems].map((ann, i) => (
                    <span
                      key={`${ann.sort_order}-${i}`}
                      className="member-home-ann-segment inline-flex shrink-0 items-center"
                    >
                      {i > 0 ? (
                        <span
                          className="member-home-ann-sep mx-3 inline-block h-3.5 w-px shrink-0 rounded-full bg-[hsl(var(--pu-m-text)/0.28)]"
                          aria-hidden
                        />
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setSelectedAnn(ann)}
                        className="inline-flex max-w-[min(260px,72vw)] items-center rounded-lg border border-transparent px-2 py-1 text-left text-sm font-medium text-[hsl(var(--pu-m-text)/0.82)] transition-colors hover:border-[hsl(var(--pu-m-surface-border)/0.35)] hover:bg-[hsl(var(--pu-m-surface)/0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--pu-gold)/0.35)]"
                      >
                        <span className="truncate">
                          {(ann.title && ann.title.trim()) || (ann.content && ann.content.trim()) || t("通知", "Notice")}
                        </span>
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          <div className="mb-4 grid grid-cols-2 gap-2.5">
            <Link
              to={ROUTES.MEMBER.POINTS}
              className="m-glass relative block overflow-hidden p-4 text-center no-underline"
            >
              <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-gold/[0.06] to-pu-gold/[0.02]" />
              <div className="relative">
                <div className="mb-2 text-[11px] font-bold tracking-wide text-[hsl(var(--pu-m-text-dim))]">
                  {t("总积分", "Total points")}
                </div>
                <div className="flex min-h-[2rem] items-center justify-center text-2xl font-extrabold tabular-nums text-[hsl(var(--pu-m-text))]">
                  {showPointsSkeleton ? (
                    <MemberPointsValueSkeleton />
                  ) : pointsError ? (
                    "—"
                  ) : (
                    fmtPts(animDashTotal)
                  )}
                </div>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setPointsInfoOpen(true)}
              className="m-glass relative overflow-hidden p-4 text-center"
            >
              <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-emerald/[0.06] to-pu-emerald/[0.02]" />
              <div className="relative">
                <div className="mb-2 flex items-center justify-center gap-1 text-[11px] font-bold tracking-wide text-[hsl(var(--pu-m-text-dim))]">
                  <span>{t("可用积分", "Available points")}</span>
                  <Info className="h-3 w-3 opacity-50" strokeWidth={2.25} aria-hidden />
                </div>
                <div className="flex min-h-[2rem] items-center justify-center text-2xl font-extrabold tabular-nums text-pu-gold">
                  {showPointsSkeleton ? (
                    <MemberPointsValueSkeleton />
                  ) : pointsError ? (
                    "—"
                  ) : (
                    fmtPts(animDashAvail)
                  )}
                </div>
              </div>
            </button>
            <div className="m-glass relative overflow-hidden p-4 text-center">
              <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-rose/[0.06] to-pu-rose/[0.02]" />
              <div className="relative">
                <div className="mb-2 text-[11px] font-bold tracking-wide text-[hsl(var(--pu-m-text-dim))]">
                  {t("冻结积分", "Frozen points")}
                </div>
                <div className="flex min-h-[2rem] items-center justify-center text-2xl font-extrabold tabular-nums text-pu-rose-soft">
                  {showPointsSkeleton ? (
                    <MemberPointsValueSkeleton />
                  ) : pointsError ? (
                    "—"
                  ) : (
                    fmtPts(animDashFrozen)
                  )}
                </div>
              </div>
            </div>
            <div className="m-glass relative overflow-hidden p-4 text-center">
              <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-emerald/[0.06] to-pu-emerald/[0.02]" />
              <div className="relative">
                <div className="mb-2 text-[11px] font-bold tracking-wide text-[hsl(var(--pu-m-text-dim))]">
                  {t("今日获得", "Earned today")}
                </div>
                <div className="flex min-h-[2rem] items-center justify-center text-2xl font-extrabold tabular-nums text-pu-emerald">
                  {showTodayEarnedSkeleton ? <MemberPointsValueSkeleton /> : fmtPts(animDashToday)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="-mt-2 mb-7 px-5">
        <div className="grid grid-cols-4 gap-3">
          <Link
            to={ROUTES.MEMBER.POINTS}
            className="group flex flex-col items-center gap-2 rounded-2xl p-3 no-underline transition-all duration-200"
          >
            <div
              className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-pu-gold to-pu-gold-deep transition-transform duration-300 group-hover:scale-105 motion-reduce:group-hover:scale-100"
              style={{ boxShadow: "0 6px 20px -6px hsl(var(--pu-m-surface-border) / 0.4)" }}
            >
              <Gift className="h-[22px] w-[22px] text-[hsl(var(--pu-primary-foreground))]" strokeWidth={2} aria-hidden />
            </div>
            <span className="text-center text-[11px] font-bold text-[hsl(var(--pu-m-text-dim))] transition group-hover:text-[hsl(var(--pu-m-text))]">
              {t("积分商城", "Points mall")}
            </span>
          </Link>
          {showSpin ? (
            <Link
              to={ROUTES.MEMBER.SPIN}
              className="group flex flex-col items-center gap-2 rounded-2xl p-3 no-underline transition-all duration-200"
              aria-label={t("进入幸运抽奖", "Go to lucky draw")}
            >
              <div
                className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-pu-rose to-pu-rose-soft transition-transform duration-300 group-hover:scale-105 motion-reduce:group-hover:scale-100"
                style={{ boxShadow: "0 6px 20px -6px hsl(var(--pu-m-surface-border) / 0.4)" }}
              >
                <Star className="h-[22px] w-[22px] text-[hsl(var(--pu-m-bg-1))]" strokeWidth={2} aria-hidden />
              </div>
              <span className="text-center text-[11px] font-bold text-[hsl(var(--pu-m-text-dim))] transition group-hover:text-[hsl(var(--pu-m-text))]">
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
              className="group flex flex-col items-center gap-2 rounded-2xl p-3 no-underline transition-all duration-200"
            >
              <div
                className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-pu-emerald to-pu-emerald-soft transition-transform duration-300 group-hover:scale-105 motion-reduce:group-hover:scale-100"
                style={{ boxShadow: "0 6px 20px -6px hsl(var(--pu-m-surface-border) / 0.4)" }}
              >
                <Users className="h-[22px] w-[22px] text-[hsl(var(--pu-m-bg-1))]" strokeWidth={2} aria-hidden />
              </div>
              <span className="text-center text-[11px] font-bold text-[hsl(var(--pu-m-text-dim))] transition group-hover:text-[hsl(var(--pu-m-text))]">
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
          <Link
            to={ROUTES.MEMBER.WALLET}
            className="group flex flex-col items-center gap-2 rounded-2xl p-3 no-underline transition-all duration-200"
          >
            <div
              className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl bg-gradient-to-br from-pu-silver to-pu-silver-soft transition-transform duration-300 group-hover:scale-105 motion-reduce:group-hover:scale-100"
              style={{ boxShadow: "0 6px 20px -6px hsl(var(--pu-m-surface-border) / 0.4)" }}
            >
              <Wallet className="h-[22px] w-[22px] text-[hsl(var(--pu-m-bg-1))]" strokeWidth={2} aria-hidden />
            </div>
            <span className="text-center text-[11px] font-bold text-[hsl(var(--pu-m-text-dim))] transition group-hover:text-[hsl(var(--pu-m-text))]">
              {t("我的钱包", "Wallet")}
            </span>
          </Link>
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

      <div className="mb-7 px-5">{tasksSection}</div>

      {announcementItems.length > 0 ? (
        <div className="mb-6 px-5">
          <div className="mb-3 flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-pu-rose" aria-hidden />
            <h3 className="text-base font-extrabold text-[hsl(var(--pu-m-text))]">{t("系统公告", "Announcements")}</h3>
          </div>
          <div className="space-y-2.5">
            {announcementItems.slice(0, 8).map((item) => {
              const annDate = formatAnnouncementPublishedAt(item.published_at, language);
              return (
              <button
                key={`${item.sort_order}-${item.title}-${item.content?.slice(0, 12)}`}
                type="button"
                onClick={() => setSelectedAnn(item)}
                className="w-full rounded-[1.25rem] p-4 text-left m-glass"
              >
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold text-[hsl(var(--pu-m-text))]">
                    {(item.title && item.title.trim()) || t("公告", "Notice")}
                  </span>
                  {annDate ? (
                    <span className="shrink-0 text-[10px] font-medium tabular-nums text-[hsl(var(--pu-m-text-dim)/0.6)]">
                      {annDate}
                    </span>
                  ) : null}
                </div>
                <p className="line-clamp-3 text-xs leading-relaxed text-[hsl(var(--pu-m-text-dim))]">
                  {(item.content && item.content.trim()) || ""}
                </p>
              </button>
            );
            })}
          </div>
        </div>
      ) : null}

      {showInvite ? (
        <div className="mb-6 px-5">
          <div
            className="relative overflow-hidden rounded-[1.25rem] border border-[hsl(var(--pu-emerald)/0.15)] p-6 text-center m-glass"
          >
            <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-emerald/[0.04] to-pu-gold/[0.03]" />
            <div className="relative">
              <Share2 className="mx-auto mb-3 h-8 w-8 text-pu-emerald" aria-hidden />
              <h3 className="mb-1 text-lg font-extrabold text-[hsl(var(--pu-m-text))]">{t("邀请好友赚转盘", "Invite friends for spins")}</h3>
              <p className="mb-5 text-xs text-[hsl(var(--pu-m-text-dim))]">
                {ps.daily_invite_reward_limit > 0
                  ? t(
                      `双方各得 ${ps.invite_reward_spins} 次转盘 · 每日上限 ${ps.daily_invite_reward_limit}`,
                      `${ps.invite_reward_spins} spins each · daily cap ${ps.daily_invite_reward_limit}`,
                    )
                  : t(
                      `双方各得 ${ps.invite_reward_spins} 次转盘`,
                      `${ps.invite_reward_spins} spins for each side`,
                    )}
              </p>
              <Button
                type="button"
                className="btn-glow rounded-xl px-8 py-2.5 text-sm font-bold transition-transform active:scale-95"
                asChild
              >
                <Link
                  to={ROUTES.MEMBER.INVITE}
                  onClick={() => stashPointsHashBeforeInviteNavigation(window.location.pathname, window.location.hash)}
                >
                  {t("立即邀请", "Invite now")}
                </Link>
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col items-center px-5 pb-24">{securitySection}</div>

      <DrawerDetail
        open={pointsInfoOpen}
        onOpenChange={setPointsInfoOpen}
        variant="member"
        title={t("积分构成", "Points breakdown")}
        sheetMaxWidth="xl"
      >
        {memberPointsInfoPanel}
      </DrawerDetail>

        <Sheet
          open={popupOpen}
          onOpenChange={(open) => {
            if (!open) onAnnouncementPopupClose();
          }}
        >
          <SheetContent
            side="center"
            showClose={false}
            overlayClassName="z-[1100] member-announcement-overlay"
            className="member-announcement-sheet !z-[1110] focus:outline-none"
            aria-labelledby="member-announcement-title"
            aria-describedby="member-announcement-body"
            onPointerDownOutside={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => e.preventDefault()}
          >
          <div className="member-announcement-modal">
            {/* ── 顶部区域 ── */}
            <header className="member-announcement-modal__header">
              <div className="member-announcement-modal__badge">
                <Megaphone size={10} strokeWidth={2.5} aria-hidden />
                <span>{t("公告", "Announcement")}</span>
              </div>
              <div className="member-announcement-modal__icon-box" aria-hidden>
                <Megaphone size={22} strokeWidth={2} />
              </div>
              <SheetTitle asChild>
                <h2 id="member-announcement-title" className="member-announcement-modal__title">
                  {ps.announcement_popup_title || t("系统公告", "System Announcement")}
                </h2>
              </SheetTitle>
              <p className="member-announcement-modal__subtitle">
                {t("来自团队的重要提示", "Important notice from the team")}
              </p>
              <div className="member-announcement-modal__divider" aria-hidden />
            </header>

            {/* ── 正文区域 ── */}
            <div
              className="member-announcement-modal__body"
              id="member-announcement-body"
              role="region"
              aria-label={t("公告正文", "Announcement content")}
            >
              <div className="member-announcement-modal__content-card">
                <div className="member-announcement-modal__text">
                  {ps.announcement_popup_content || ""}
                </div>
              </div>
            </div>

            {/* ── 底部区域 ── */}
            <footer className="member-announcement-modal__footer">
              <Button
                type="button"
                className="member-announcement-modal__btn"
                onClick={onAnnouncementPopupClose}
              >
                {t("知道了", "Understood")}
              </Button>
              <p className="member-announcement-modal__hint">
                {t("请仔细阅读后继续", "Please read carefully before continuing")}
              </p>
            </footer>
          </div>
          </SheetContent>
        </Sheet>

        <DrawerDetail
          open={!!selectedAnn}
          onOpenChange={(open) => {
            if (!open) setSelectedAnn(null);
          }}
          variant="member"
          title={(selectedAnn?.title && selectedAnn.title.trim()) || t("公告", "Announcement")}
          description={
            formatAnnouncementPublishedAt(selectedAnn?.published_at, language) ||
            t("来自团队", "From your team")
          }
          sheetMaxWidth="2xl"
        >
          <div className="space-y-4">
            <div style={{ maxHeight: "min(60vh, 420px)", overflowY: "auto" }}>
              {selectedAnn?.image_url && String(selectedAnn.image_url).trim() ? (
                <MemberAnnouncementDrawerImage
                  stableKey={`ann-${selectedAnn.sort_order}-${String(selectedAnn.image_url).trim()}`}
                  rawUrl={selectedAnn.image_url}
                />
              ) : null}
              <div className="whitespace-pre-wrap text-sm leading-[1.65] text-[hsl(var(--pu-m-text-dim))]">
                {selectedAnn?.content || ""}
              </div>
            </div>
            <Button
              type="button"
              className="h-11 w-full rounded-xl border-0 text-sm font-bold text-[hsl(var(--pu-primary-foreground))] hover:opacity-95"
              style={{
                background: "linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
              }}
              onClick={() => setSelectedAnn(null)}
            >
              {t("关闭", "Close")}
            </Button>
          </div>
        </DrawerDetail>

        <DrawerDetail
          open={signOutOpen}
          onOpenChange={setSignOutOpen}
          variant="member"
          headerAlign="center"
          title={t("退出登录", "Sign out")}
          description={t("确定要退出当前账号吗？", "Are you sure you want to sign out?")}
          sheetMaxWidth="xl"
        >
          <div className="flex w-full flex-wrap items-center justify-center gap-2 border-t border-[hsl(var(--pu-m-surface-border)/0.35)] pt-4">
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-xl border-[hsl(var(--pu-m-surface-border)/0.4)] bg-[hsl(var(--pu-m-surface)/0.35)] text-[hsl(var(--pu-m-text))] hover:bg-[hsl(var(--pu-m-surface)/0.55)] hover:text-[hsl(var(--pu-m-text))]"
              onClick={() => setSignOutOpen(false)}
            >
              {t("取消", "Cancel")}
            </Button>
            <Button
              type="button"
              className="h-11 rounded-xl border-0 bg-red-600 px-6 font-semibold text-white hover:bg-red-700"
              onClick={() => {
                setSignOutOpen(false);
                void signOut();
              }}
            >
              {t("退出登录", "Sign out")}
            </Button>
          </div>
        </DrawerDetail>
    </div>
  );
}
