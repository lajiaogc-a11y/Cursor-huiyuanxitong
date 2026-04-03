/**
 * 会员首页：每日签到、分享领奖状态与操作（业务规则与 RPC 调用集中于此，页面只做展示）。
 */
import { useCallback, useEffect, useState } from "react";
import { notifyError, notifyInfo, notifySuccess } from "@/utils/notify";
import { ApiError } from "@/lib/apiClient";
import { useActionGuard } from "@/lib/actionGuard";
import {
  fetchMemberDailyStatus,
  memberCheckIn,
  memberClaimShareReward,
} from "@/services/memberPortal/memberDailyTasksPortalService";
import type { MemberDailyStatus } from "@/services/memberPortal/memberActivityService";

export type MemberDashboardDailyTasksOptions = {
  memberId: string | undefined;
  inviteToken: string;
  invitePathFallback: string;
  buildShareInviteText: (inviteLink: string) => string;
  refreshMember: () => Promise<void>;
  refreshPoints: () => void | Promise<void>;
  refreshSpinQuota: () => void | Promise<void>;
};

interface DailyCache {
  checkedIn: boolean;
  shareCreditsToday: number;
  dailyShareCap: number;
  summary: MemberDailyStatus;
  spinsEarned: number | null;
  shareSpinsEarned: number | null;
}

const _dailyStatusCache = new Map<string, DailyCache>();

export function useMemberDashboardDailyTasks({
  memberId,
  inviteToken,
  invitePathFallback,
  buildShareInviteText,
  refreshMember,
  refreshPoints,
  refreshSpinQuota,
}: MemberDashboardDailyTasksOptions) {
  const checkInGuard = useActionGuard(2000);
  const shareGuard = useActionGuard(2000);
  const cached = memberId ? _dailyStatusCache.get(memberId) : undefined;

  const [checkedInToday, setCheckedInToday] = useState(cached?.checkedIn ?? false);
  const [checkingIn, setCheckingIn] = useState(false);

  const [shareCreditsToday, setShareCreditsToday] = useState(cached?.shareCreditsToday ?? 0);
  const [dailyShareCap, setDailyShareCap] = useState(cached?.dailyShareCap ?? 0);
  const shareCapReached = dailyShareCap > 0 && shareCreditsToday >= dailyShareCap;

  const [claimingShare, setClaimingShare] = useState(false);
  const [checkInSpinsEarned, setCheckInSpinsEarned] = useState<number | null>(cached?.spinsEarned ?? null);
  const [checkInSummary, setCheckInSummary] = useState<MemberDailyStatus | null>(cached?.summary ?? null);
  const [shareSpinsEarned, setShareSpinsEarned] = useState<number | null>(cached?.shareSpinsEarned ?? null);

  useEffect(() => {
    if (!memberId) return;
    const c = _dailyStatusCache.get(memberId);
    if (c) {
      setCheckedInToday(c.checkedIn);
      setShareCreditsToday(c.shareCreditsToday);
      setDailyShareCap(c.dailyShareCap);
      setCheckInSummary(c.summary);
      setCheckInSpinsEarned(c.spinsEarned);
      setShareSpinsEarned(c.shareSpinsEarned);
    } else {
      setCheckInSpinsEarned(null);
      setShareSpinsEarned(null);
      setCheckInSummary(null);
      setShareCreditsToday(0);
      setDailyShareCap(0);
    }
  }, [memberId]);

  useEffect(() => {
    if (!memberId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetchMemberDailyStatus(memberId);
        if (cancelled) return;
        setCheckedInToday(!!r.checked_in_today);
        const sc = Math.max(0, Number(r.share_credits_today ?? 0));
        const cap = Math.max(0, Number(r.daily_share_cap ?? 0));
        setShareCreditsToday(sc);
        setDailyShareCap(cap);
        setCheckInSummary(r);
        _dailyStatusCache.set(memberId, {
          checkedIn: !!r.checked_in_today,
          shareCreditsToday: sc,
          dailyShareCap: cap,
          summary: r,
          spinsEarned: null,
          shareSpinsEarned: null,
        });
      } catch {
        if (!cancelled && !_dailyStatusCache.has(memberId)) {
          setCheckedInToday(false);
          setShareCreditsToday(0);
          setDailyShareCap(0);
          setCheckInSummary(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId]);

  const handleCheckIn = useCallback(async () => {
    if (!memberId || checkedInToday || checkingIn) return;
    await checkInGuard(async () => {
      setCheckingIn(true);
      try {
        const r = await memberCheckIn(memberId);
        if (r.success) {
          setCheckedInToday(r.checked_in_today !== false);
          const granted = Math.max(0, Math.floor(Number(r.credits_granted ?? 0)));
          setCheckInSpinsEarned(granted);
          try {
            const snap = await fetchMemberDailyStatus(memberId);
            setCheckInSummary(snap);
            setCheckedInToday(!!snap.checked_in_today);
            const sc = Math.max(0, Number(snap.share_credits_today ?? 0));
            const cap = Math.max(0, Number(snap.daily_share_cap ?? 0));
            setShareCreditsToday(sc);
            setDailyShareCap(cap);
            _dailyStatusCache.set(memberId, {
              checkedIn: !!snap.checked_in_today,
              shareCreditsToday: sc,
              dailyShareCap: cap,
              summary: snap,
              spinsEarned: granted,
              shareSpinsEarned: shareSpinsEarned,
            });
          } catch { /* non-critical */ }
          try { await refreshMember(); } catch { /* non-critical */ }
          try { await Promise.resolve(refreshPoints()); } catch { /* non-critical */ }
          try { await Promise.resolve(refreshSpinQuota()); } catch { /* non-critical */ }
          try { if (navigator.vibrate) navigator.vibrate([15, 50, 15]); } catch { /* ignore */ }
          const rv = Number(r.reward_value ?? 0);
          const fractional = Number.isFinite(rv) && rv % 1 !== 0;
          if (fractional) {
            notifySuccess([
              `签到成功！连续 ${r.consecutive_days} 天，约 ${rv} 次（已计入 ${granted} 次抽奖）`,
              `Check-in OK! ${r.consecutive_days}-day streak — about ${rv} spin(s) (${granted} counted).`,
            ]);
          } else {
            notifySuccess([
              `签到成功！连续 ${r.consecutive_days} 天，+${granted} 次抽奖`,
              `Check-in OK! ${r.consecutive_days}-day streak, +${granted} spin(s).`,
            ]);
          }
        } else if (r.error === "ALREADY_CHECKED_IN") {
          setCheckedInToday(true);
          notifyInfo(["今日已签到", "Already checked in today"]);
        } else if (r.error === "CHECK_IN_DISABLED") {
          notifyInfo(["签到功能暂未开启", "Check-in is not available"]);
        } else if (r.error === "MEMBER_NOT_FOUND") {
          notifyError(["会员信息异常，请重新登录", "Account error, please sign in again"]);
        } else if (r.error === "RATE_LIMIT") {
          notifyError(["操作过于频繁，请稍后再试", "Too many attempts, try again later"]);
        } else {
          notifyError([
            r.error || "签到失败，请稍后重试",
            r.error || "Check-in failed, please try again later",
          ]);
        }
      } catch (e: unknown) {
        if (e instanceof ApiError && e.statusCode === 401) {
          notifyError(["登录已过期，请重新登录", "Session expired, please sign in again"]);
        } else if (e instanceof ApiError && e.statusCode === 429) {
          notifyError(["操作过于频繁，请稍后再试", "Too many attempts, try again later"]);
        } else {
          notifyError([
            e instanceof Error ? e.message : "网络错误，请检查网络后重试",
            e instanceof Error ? e.message : "Network error. Check your connection and try again.",
          ]);
        }
      } finally {
        setCheckingIn(false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    memberId,
    checkedInToday,
    checkingIn,
    checkInGuard,
    refreshMember,
    refreshPoints,
    refreshSpinQuota,
  ]);

  const handleShareAndClaim = useCallback(async () => {
    if (!memberId || claimingShare || shareCapReached) return;
    await shareGuard(async () => {
      const inviteLink = `${window.location.origin}/invite/${inviteToken || invitePathFallback || ""}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(buildShareInviteText(inviteLink))}`, "_blank", "noopener,noreferrer");
      setClaimingShare(true);
      try {
        const r = await memberClaimShareReward(memberId);
        if (r?.success) {
          const n = Math.max(0, Math.floor(Number(r.credits ?? 1)));
          setShareSpinsEarned(n);
          const sc = Math.max(0, Number(r.share_credits_today ?? shareCreditsToday + n));
          const cap = r.daily_share_cap != null ? Math.max(0, Number(r.daily_share_cap)) : dailyShareCap;
          setShareCreditsToday(sc);
          setDailyShareCap(cap);
          const prev = _dailyStatusCache.get(memberId);
          if (prev) {
            _dailyStatusCache.set(memberId, { ...prev, shareCreditsToday: sc, dailyShareCap: cap, shareSpinsEarned: n });
          }
          try { await Promise.resolve(refreshSpinQuota()); } catch { /* non-critical */ }
          try { if (navigator.vibrate) navigator.vibrate(12); } catch { /* ignore */ }
          const capMsg = cap > 0 ? ` (${sc}/${cap})` : "";
          notifySuccess([`分享成功！已获得 ${n} 次抽奖${capMsg}`, `Shared! You earned ${n} spin(s)${capMsg}.`]);
        } else if (r?.error === "ALREADY_CLAIMED_TODAY") {
          setShareCreditsToday((prev) => Math.max(prev, dailyShareCap));
          notifyInfo(["今日分享奖励已达上限", "Daily share reward limit reached"]);
        } else if (r?.error === "SHARE_REWARD_DISABLED") {
          notifyInfo(["未开启分享奖励", "Share reward is not enabled"]);
        } else if (r?.error === "SHARE_DAILY_CAP_REACHED") {
          const serverCap = Math.max(0, Number((r as { cap?: number }).cap ?? dailyShareCap));
          const serverToday = Math.max(0, Number((r as { today?: number }).today ?? shareCreditsToday));
          setShareCreditsToday(serverToday);
          if (serverCap > 0) setDailyShareCap(serverCap);
          notifyInfo([`今日分享奖励已达上限 (${serverToday}/${serverCap})`, `Daily share limit reached (${serverToday}/${serverCap})`]);
        } else if (r?.error === "DUPLICATE_REQUEST") {
          notifyInfo(["请勿重复领取，请稍候再试", "Please wait before claiming again"]);
        } else if (r?.error === "MEMBER_NOT_FOUND") {
          notifyError(["会员信息异常，请重新登录", "Account error, please sign in again"]);
        } else {
          notifyError([
            typeof r?.error === "string" ? r.error : "领取失败",
            typeof r?.error === "string" ? r.error : "Claim failed",
          ]);
        }
      } catch (e: unknown) {
        if (e instanceof ApiError && e.statusCode === 429) {
          notifyError([
            e.message || "操作过于频繁，请稍后再试",
            e.message || "Too many attempts, try again later",
          ]);
        } else {
          notifyError([e instanceof Error ? e.message : "网络错误", e instanceof Error ? e.message : "Network error"]);
        }
      } finally {
        setClaimingShare(false);
      }
    });
  }, [
    memberId,
    claimingShare,
    shareCapReached,
    shareGuard,
    inviteToken,
    invitePathFallback,
    buildShareInviteText,
    refreshSpinQuota,
    shareCreditsToday,
    dailyShareCap,
  ]);

  return {
    checkedInToday,
    checkingIn,
    shareCapReached,
    shareCreditsToday,
    dailyShareCap,
    claimingShare,
    checkInSpinsEarned,
    shareSpinsEarned,
    checkInSummary,
    handleCheckIn,
    handleShareAndClaim,
  };
}
