/**
 * 会员首页：每日签到、分享领奖状态与操作（业务规则与 RPC 调用集中于此，页面只做展示）。
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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
  /** token 未就绪时用于邀请路径的回退（如 member_code） */
  invitePathFallback: string;
  /** 生成 WhatsApp 分享文案（含邀请链接） */
  buildShareInviteText: (inviteLink: string) => string;
  refreshMember: () => Promise<void>;
  refreshPoints: () => void | Promise<void>;
  refreshSpinQuota: () => void | Promise<void>;
};

const _dailyStatusCache = new Map<string, { checkedIn: boolean; shareClaimed: boolean; summary: MemberDailyStatus; spinsEarned: number | null; shareSpinsEarned: number | null }>();

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
  const [shareClaimedToday, setShareClaimedToday] = useState(cached?.shareClaimed ?? false);
  const [claimingShare, setClaimingShare] = useState(false);
  const [checkInSpinsEarned, setCheckInSpinsEarned] = useState<number | null>(cached?.spinsEarned ?? null);
  const [checkInSummary, setCheckInSummary] = useState<MemberDailyStatus | null>(cached?.summary ?? null);
  const [shareSpinsEarned, setShareSpinsEarned] = useState<number | null>(cached?.shareSpinsEarned ?? null);

  useEffect(() => {
    if (!memberId) return;
    const c = _dailyStatusCache.get(memberId);
    if (c) {
      setCheckedInToday(c.checkedIn);
      setShareClaimedToday(c.shareClaimed);
      setCheckInSummary(c.summary);
      setCheckInSpinsEarned(c.spinsEarned);
      setShareSpinsEarned(c.shareSpinsEarned);
    } else {
      setCheckInSpinsEarned(null);
      setShareSpinsEarned(null);
      setCheckInSummary(null);
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
        setShareClaimedToday(!!r.share_claimed_today);
        setCheckInSummary(r);
        _dailyStatusCache.set(memberId, {
          checkedIn: !!r.checked_in_today,
          shareClaimed: !!r.share_claimed_today,
          summary: r,
          spinsEarned: null,
          shareSpinsEarned: null,
        });
      } catch {
        if (!cancelled && !_dailyStatusCache.has(memberId)) {
          setCheckedInToday(false);
          setShareClaimedToday(false);
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
            _dailyStatusCache.set(memberId, {
              checkedIn: !!snap.checked_in_today,
              shareClaimed: shareClaimedToday,
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
            toast.success(`签到成功！连续 ${r.consecutive_days} 天，约 ${rv} 次（已计入 ${granted} 次抽奖）`);
          } else {
            toast.success(`签到成功！连续 ${r.consecutive_days} 天，+${granted} 次抽奖`);
          }
        } else if (r.error === "ALREADY_CHECKED_IN") {
          setCheckedInToday(true);
          toast.info("今日已签到");
        } else if (r.error === "CHECK_IN_DISABLED") {
          toast.info("签到功能暂未开启");
        } else if (r.error === "MEMBER_NOT_FOUND") {
          toast.error("会员信息异常，请重新登录");
        } else if (r.error === "RATE_LIMIT") {
          toast.error("操作过于频繁，请稍后再试");
        } else {
          toast.error(r.error || "签到失败，请稍后重试");
        }
      } catch (e: unknown) {
        if (e instanceof ApiError && e.statusCode === 401) {
          toast.error("登录已过期，请重新登录");
        } else if (e instanceof ApiError && e.statusCode === 429) {
          toast.error("操作过于频繁，请稍后再试");
        } else {
          toast.error(e instanceof Error ? e.message : "网络错误，请检查网络后重试");
        }
      } finally {
        setCheckingIn(false);
      }
    });
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
    if (!memberId || claimingShare || shareClaimedToday) return;
    await shareGuard(async () => {
      const inviteLink = `${window.location.origin}/invite/${inviteToken || invitePathFallback || ""}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(buildShareInviteText(inviteLink))}`, "_blank", "noopener,noreferrer");
      setClaimingShare(true);
      try {
        const r = await memberClaimShareReward(memberId);
        if (r?.success) {
          setShareClaimedToday(r.share_claimed_today !== false);
          const n = Math.max(0, Math.floor(Number(r.credits ?? 1)));
          setShareSpinsEarned(n);
          const prev = _dailyStatusCache.get(memberId);
          if (prev) {
            _dailyStatusCache.set(memberId, { ...prev, shareClaimed: true, shareSpinsEarned: n });
          }
          try { await Promise.resolve(refreshSpinQuota()); } catch { /* non-critical */ }
          try { if (navigator.vibrate) navigator.vibrate(12); } catch { /* ignore */ }
          toast.success(`分享成功！已获得 ${n} 次抽奖`);
        } else if (r?.error === "ALREADY_CLAIMED_TODAY") {
          setShareClaimedToday(true);
          toast.info("今日已领取过分享奖励");
        } else if (r?.error === "SHARE_REWARD_DISABLED") {
          toast.info("未开启分享奖励");
        } else if (r?.error === "SHARE_DAILY_CAP_REACHED") {
          toast.info("今日分享奖励已达上限");
        } else if (r?.error === "DUPLICATE_REQUEST") {
          toast.info("请勿重复领取，请稍候再试");
        } else if (r?.error === "MEMBER_NOT_FOUND") {
          toast.error("会员信息异常，请重新登录");
        } else {
          toast.error(typeof r?.error === "string" ? r.error : "领取失败");
        }
      } catch (e: unknown) {
        if (e instanceof ApiError && e.statusCode === 429) {
          toast.error(e.message || "操作过于频繁，请稍后再试");
        } else {
          toast.error(e instanceof Error ? e.message : "网络错误");
        }
      } finally {
        setClaimingShare(false);
      }
    });
  }, [
    memberId,
    claimingShare,
    shareClaimedToday,
    shareGuard,
    inviteToken,
    invitePathFallback,
    buildShareInviteText,
    refreshSpinQuota,
  ]);

  return {
    checkedInToday,
    checkingIn,
    shareClaimedToday,
    claimingShare,
    checkInSpinsEarned,
    shareSpinsEarned,
    checkInSummary,
    handleCheckIn,
    handleShareAndClaim,
  };
}
