import { useEffect, useLayoutEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Share2, ShieldCheck, Megaphone } from "lucide-react";
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
import "@/styles/member-portal.css";
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";
import { MemberDashboardBannerSection } from "@/components/member/dashboard/MemberDashboardBannerSection";
import { MemberDashboardDailyTasks } from "@/components/member/dashboard/MemberDashboardDailyTasks";
import { MemberDashboardPointsStatGrid } from "@/components/member/dashboard/MemberDashboardPointsStatGrid";
import { MemberDashboardPortalOverlays } from "@/components/member/dashboard/MemberDashboardPortalOverlays";
import { MemberDashboardProfileBar } from "@/components/member/dashboard/MemberDashboardProfileBar";
import { MemberDashboardQuickActions } from "@/components/member/dashboard/MemberDashboardQuickActions";
import { useMemberSkeletonGate } from "@/hooks/useMemberSkeletonGate";
import { resolveHomePointsBalanceFooter } from "@/lib/memberPortalBilingualHint";
import { useMemberLocalAvatar } from "@/hooks/useMemberLocalAvatar";
import { getMemberPortalDisplayName } from "@/lib/memberDisplayName";
import { displayMemberLevelLabel } from "@/lib/memberLevelDisplay";
import { getMemberTodayEarnedRpc } from "@/services/points/memberPointsRpcService";
import { formatAnnouncementPublishedAt } from "@/lib/memberPortalAnnouncementDate";
import { useMemberAnimatedCount } from "@/hooks/useMemberAnimatedCount";
import { useMemberPullRefreshSignal } from "@/hooks/useMemberPullRefreshSignal";
import {
  getMemberInboxUnreadCount,
  setMemberInboxUnreadCount,
  subscribeMemberInboxUnreadCount,
} from "@/lib/memberInboxUnreadStore";
import { cn } from "@/lib/utils";

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

export default function MemberDashboard() {
  const { theme, toggleTheme } = useTheme();
  const { t, language } = useLanguage();
  const { member, signOut, refreshMember } = useMemberAuth();
  const { breakdown, loading, error: pointsError, refresh: refreshPoints } = useMemberPointsBreakdown(member?.id);
  const { remaining: spinRemaining, error: spinError, refresh: refreshSpinQuota } = useMemberSpinQuota(member?.id);
  const { settings: ps, loading: portalLoading } = useMemberPortalSettings(member?.id);
  const showMemberInbox = !!ps.enable_member_inbox;
  const [popupOpen, setPopupOpen] = useState(() => {
    if (!member?.id) return false;
    const body = String(ps.announcement_popup_content || "").trim();
    if (!body) return false;
    const freq = (() => {
      const f = ps.announcement_popup_frequency;
      if (f === "daily_first" || f === "every_login" || f === "off") return f;
      return ps.show_announcement_popup ? "every_login" : "off";
    })();
    if (freq === "off") return false;
    const fp = announcementPopupContentFingerprint(ps.announcement_popup_title || "", ps.announcement_popup_content);
    if (freq === "every_login") {
      try { if (sessionStorage.getItem(`member_ann_popup_sess_${member.id}_${fp}`)) return false; } catch { /* */ }
    }
    if (freq === "daily_first") {
      const dk = `member_ann_popup_day_${member.id}_${localCalendarDateKey()}_${fp}`;
      try { if (localStorage.getItem(dk)) return false; } catch { /* */ }
    }
    return true;
  });
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [todayEarned, setTodayEarned] = useState(0);
  const [todayEarnedLoading, setTodayEarnedLoading] = useState(true);
  const [pullRefreshGen, setPullRefreshGen] = useState(0);
  const todayEarnedHydratedRef = useRef(false);

  useMemberPullRefreshSignal(() => {
    setPullRefreshGen((g) => g + 1);
  });

  useEffect(() => {
    setPullRefreshGen(0);
    todayEarnedHydratedRef.current = false;
    setTodayEarnedLoading(true);
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

  useLayoutEffect(() => {
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
    shareCapReached,
    shareCreditsToday,
    dailyShareCap,
    sharing,
    claimingShare,
    pendingShareNonce,
    checkInSummary,
    handleCheckIn,
    handleShare,
    handleClaimShareReward,
  } = useMemberDashboardDailyTasks({
    memberId: member?.id,
    inviteToken,
    invitePathFallback: member?.member_code || "",
    buildShareInviteText,
    refreshMember: async () => {
      await refreshMember();
    },
    refreshPoints: async () => {
      await refreshPoints();
    },
    refreshSpinQuota: async () => {
      await refreshSpinQuota();
    },
  });

  const totalStaffRemaining = breakdown.balance;
  const pendingMallFrozen = breakdown.pending_mall_points;
  const availablePointsHome = Math.max(
    0,
    Math.round((totalStaffRemaining - pendingMallFrozen) * 100) / 100,
  );
  const ptsTilesAnimOn = Boolean(member) && !loading && !pointsError;
  /** 首页关闭滚字动画：就绪后直接显示数值，避免从 0 扫到目标造成闪跳（积分页等仍可保留动画） */
  const rollPointsOnDashboard = false;
  const animDashTotal = useMemberAnimatedCount(totalStaffRemaining, {
    enabled: rollPointsOnDashboard && ptsTilesAnimOn,
    durationMs: 780,
  });
  const animDashAvail = useMemberAnimatedCount(availablePointsHome, {
    enabled: rollPointsOnDashboard && ptsTilesAnimOn,
    durationMs: 880,
  });
  const animDashFrozen = useMemberAnimatedCount(pendingMallFrozen, {
    enabled: rollPointsOnDashboard && ptsTilesAnimOn,
    durationMs: 980,
  });
  const animDashToday = useMemberAnimatedCount(todayEarned, {
    enabled: rollPointsOnDashboard && Boolean(member) && !todayEarnedLoading,
    durationMs: 820,
  });
  const animReferralCount = useMemberAnimatedCount(breakdown.referral_count, {
    enabled: rollPointsOnDashboard && ptsTilesAnimOn,
    durationMs: 700,
  });
  const animConsumptionPts = useMemberAnimatedCount(breakdown.consumption_points, {
    enabled: rollPointsOnDashboard && ptsTilesAnimOn,
    durationMs: 720,
  });
  const animBucketReferralPts = useMemberAnimatedCount(breakdown.referral_points, {
    enabled: rollPointsOnDashboard && ptsTilesAnimOn,
    durationMs: 740,
  });
  const animLotteryPts = useMemberAnimatedCount(breakdown.lottery_points, {
    enabled: rollPointsOnDashboard && ptsTilesAnimOn,
    durationMs: 760,
  });

  const showPointsSkeleton = useMemberSkeletonGate(loading);
  const showTodayEarnedSkeleton = useMemberSkeletonGate(todayEarnedLoading);
  const showCheckInSublineSkeleton = useMemberSkeletonGate(!checkInSummary);

  /** Banner 独立占位：仅首拉且无缓存轮播数据时显示，避免用 portalLoading 锁整页 */
  const hasHomeBannerRows = Array.isArray(ps.home_banners) && ps.home_banners.length > 0;
  const showBannerPlaceholder = portalLoading && !hasHomeBannerRows;

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
    (showCheckIn && checkedInToday ? 1 : 0) + (showShare && shareCapReached ? 1 : 0);

  useEffect(() => {
    if (!member?.id) return;
    let cancelled = false;
    if (!todayEarnedHydratedRef.current) {
      setTodayEarnedLoading(true);
    }
    void (async () => {
      const earned = await getMemberTodayEarnedRpc(member.id);
      if (cancelled) return;
      setTodayEarned(earned);
      todayEarnedHydratedRef.current = true;
      setTodayEarnedLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [member?.id, checkedInToday, shareCapReached]);

  /** 下拉刷新：静默更新「今日获得」避免与 React Query 并发时再闪一屏骨架 */
  useEffect(() => {
    if (!member?.id || pullRefreshGen === 0) return;
    let cancelled = false;
    void (async () => {
      const earned = await getMemberTodayEarnedRpc(member.id);
      if (cancelled) return;
      setTodayEarned(earned);
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

  const fmtPts = useCallback(
    (n: number) =>
      Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }),
    [],
  );

  const pointsBreakdownProps = useMemo(
    () => ({
      t,
      fmtPts,
      themeColor,
      animDashTotal,
      animDashAvail,
      animDashFrozen,
      animReferralCount,
      animConsumptionPts,
      animBucketReferralPts,
      animLotteryPts,
      homePointsBalanceFooter,
      pointsPopoverMallNote,
    }),
    [
      t,
      fmtPts,
      themeColor,
      animDashTotal,
      animDashAvail,
      animDashFrozen,
      animReferralCount,
      animConsumptionPts,
      animBucketReferralPts,
      animLotteryPts,
      homePointsBalanceFooter,
      pointsPopoverMallNote,
    ],
  );

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

  return (
    <div className="member-page-enter elite-soft-scroll m-page-bg flex min-h-full flex-col">
      <div className="relative flex-1 overflow-x-hidden">
        <MemberPageAmbientOrbs />
        <div className="relative z-[1] px-5 pb-8 pt-7">
          {/* 顶栏：立即展示（主题 / 收件箱等），不依赖门户接口整页 gating */}
          <MemberDashboardProfileBar
            portalDisplayName={portalDisplayName}
            tierDisplay={tierDisplay}
            avatarLetter={avatarLetter}
            showHomeAvatarImg={showHomeAvatarImg}
            homeAvatarResolvedSrc={homeAvatarResolvedSrc}
            onHomeAvatarImageError={onHomeAvatarImageError}
            theme={theme}
            toggleTheme={toggleTheme}
            showMemberInbox={showMemberInbox}
            notificationUnreadCount={notificationUnreadCount}
            t={t}
          />

          {/* Banner：独立 loading；有缓存或已返回则直接渲染，避免整页等待 */}
          {showBannerPlaceholder ? (
            <div
              className="mb-5 h-[min(9.5rem,28vh)] w-full animate-pulse rounded-2xl bg-[hsl(var(--pu-m-surface)/0.16)] ring-1 ring-inset ring-[hsl(var(--pu-m-surface-border)/0.12)]"
              aria-hidden
            />
          ) : (
            <MemberDashboardBannerSection
              homeBanners={ps.home_banners}
              homeBannersCarouselIntervalSec={ps.home_banners_carousel_interval_sec}
              themeColor={themeColor}
              theme={theme}
              t={t}
              spinRemaining={spinRemaining}
              spinError={spinError}
              checkInSummary={checkInSummary}
              showPointsSkeleton={showPointsSkeleton}
              showCheckInSublineSkeleton={showCheckInSublineSkeleton}
              announcementItems={announcementItems}
              onSelectAnnouncement={setSelectedAnn}
            />
          )}

          {/* 积分区：独立骨架与错误态，由 useMemberPointsBreakdown 驱动 */}
          <MemberDashboardPointsStatGrid
            t={t}
            fmtPts={fmtPts}
            showPointsSkeleton={showPointsSkeleton}
            showTodayEarnedSkeleton={showTodayEarnedSkeleton}
            pointsError={pointsError}
            animDashTotal={animDashTotal}
            animDashAvail={animDashAvail}
            animDashFrozen={animDashFrozen}
            animDashToday={animDashToday}
            onOpenPointsInfo={() => setPointsInfoOpen(true)}
          />
        </div>
      </div>

      <MemberDashboardQuickActions
        t={t}
        showSpin={showSpin}
        showInvite={showInvite}
        spinRemaining={spinRemaining}
        spinError={spinError}
      />

      <div className="mb-7 px-5">
        <MemberDashboardDailyTasks
          t={t}
          showCheckIn={showCheckIn}
          showShare={showShare}
          showInvite={showInvite}
          dailyTaskRowsDone={dailyTaskRowsDone}
          dailyTaskRowsTotal={dailyTaskRowsTotal}
          checkedInToday={checkedInToday}
          checkingIn={checkingIn}
          checkInSummary={checkInSummary}
          showCheckInSublineSkeleton={showCheckInSublineSkeleton}
          handleCheckIn={handleCheckIn}
          shareCapReached={shareCapReached}
          shareCreditsToday={shareCreditsToday}
          dailyShareCap={dailyShareCap}
          shareRewardSpins={ps.share_reward_spins}
          sharing={sharing}
          claimingShare={claimingShare}
          pendingShareNonce={pendingShareNonce}
          handleShare={handleShare}
          handleClaimShareReward={handleClaimShareReward}
          inviteRewardSpins={ps.invite_reward_spins}
          dailyInviteRewardLimit={ps.daily_invite_reward_limit}
          inviteSuccessLifetimeCount={member.invite_success_lifetime_count ?? 0}
        />
      </div>

      {/* 公告列表：直接渲染，避免 ContentReveal 渐入造成闪跳 */}
      <div className="mb-6 px-5">
        <div className="mb-3 flex items-center gap-2">
          <Megaphone className="h-4 w-4 text-pu-rose" aria-hidden />
          <h3 className="text-base font-extrabold text-[hsl(var(--pu-m-text))]">{t("系统公告", "Announcements")}</h3>
        </div>
        {announcementItems.length === 0 ? (
          <p className="rounded-[1.25rem] border border-dashed border-[hsl(var(--pu-m-surface-border)/0.35)] bg-[hsl(var(--pu-m-surface)/0.12)] px-4 py-6 text-center text-xs text-[hsl(var(--pu-m-text-dim))]">
            {t("暂无公告", "No announcements yet")}
          </p>
        ) : (
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
        )}
      </div>

      <div className={cn("mb-6 px-5", !showInvite && "hidden")} aria-hidden={!showInvite}>
        {showInvite ? (
          <div className="relative overflow-hidden rounded-[1.25rem] border border-[hsl(var(--pu-emerald)/0.15)] p-6 text-center m-glass">
            <div className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-emerald/[0.04] to-pu-gold/[0.03]" />
            <div className="relative">
              <Share2 className="mx-auto mb-3 h-8 w-8 text-pu-emerald" aria-hidden />
              <h3 className="mb-1 text-lg font-extrabold text-[hsl(var(--pu-m-text))]">{t("邀请好友赚转盘", "Invite friends for spins")}</h3>
              {(member?.invite_success_lifetime_count ?? 0) > 0 ? (
                <p className="mb-2 text-xs font-semibold text-pu-emerald">
                  {t("已成功邀请", "Successfully invited")}{" "}
                  <span className="text-sm">+{member.invite_success_lifetime_count}</span> {t("位好友", "friends")}
                </p>
              ) : null}
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
                className="btn-glow rounded-xl px-8 py-2.5 text-sm font-bold transition-transform member-motion-fast active:scale-95"
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
        ) : null}
      </div>

      <div className="flex flex-col items-center px-5 pb-6">{securitySection}</div>

      <MemberDashboardPortalOverlays
        t={t}
        language={language}
        pointsInfoOpen={pointsInfoOpen}
        onPointsInfoOpenChange={setPointsInfoOpen}
        pointsBreakdown={pointsBreakdownProps}
        popupOpen={popupOpen}
        onAnnouncementPopupClose={onAnnouncementPopupClose}
        announcementPopupTitle={ps.announcement_popup_title || ""}
        announcementPopupContent={String(ps.announcement_popup_content || "")}
        selectedAnn={selectedAnn}
        onSelectedAnnOpenChange={(open) => {
          if (!open) setSelectedAnn(null);
        }}
        signOutOpen={signOutOpen}
        onSignOutOpenChange={setSignOutOpen}
        signOutLoading={signOutLoading}
        onSignOutLoadingChange={setSignOutLoading}
        onSignOut={signOut}
      />
    </div>
  );
}
