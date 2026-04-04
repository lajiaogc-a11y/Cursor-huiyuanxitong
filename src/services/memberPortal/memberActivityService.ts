/**
 * 会员门户：签到、分享领奖、邀请、订单与昵称等 RPC 统一入口（页面只负责展示与触发）。
 */
import { apiPost, unwrapApiData } from "@/api/client";
import { ApiError } from "@/lib/apiClient";
import { safeCall, safeActionCall } from "@/lib/serviceErrorHandler";
import { MEMBER_PORTAL_RPC_PATHS } from "./routes";

export type MemberDailyStatus = {
  checked_in?: boolean;
  checked_in_today?: boolean;
  /** true = daily cap reached (no more shares available today) */
  share_claimed_today?: boolean;
  /** Total share spin credits earned today */
  share_credits_today?: number;
  /** Configured daily cap (0 = unlimited) */
  daily_share_cap?: number;
  /** 后端计算的连续签到展示天数（已签=含今日；未签=截至昨日） */
  current_streak_days?: number;
  reward_base?: number;
  reward_extra_streak_3?: number;
  reward_extra_streak_7?: number;
  /** 下一次可签到对应的连续第几天（未签=今日签；已签=明日签） */
  next_sign_in_streak_day?: number;
  next_reward_base?: number;
  next_reward_extra?: number;
  next_reward_total?: number;
  /** 下一次签到发放的抽奖次数（ceil 后） */
  next_credits?: number;
};

export async function fetchMemberDailyStatus(memberId: string): Promise<MemberDailyStatus> {
  return safeCall(
    () => apiPost<MemberDailyStatus>(MEMBER_PORTAL_RPC_PATHS.MEMBER_CHECK_IN_TODAY, { p_member_id: memberId }),
    { checked_in_today: false, share_claimed_today: false },
    "fetchMemberDailyStatus",
  );
}

export type MemberCheckInResult = {
  success: boolean;
  error?: string;
  consecutive_days?: number;
  reward_base?: number;
  reward_extra?: number;
  reward_value?: number;
  credits_granted?: number;
  checked_in_today?: boolean;
};

export async function memberCheckIn(memberId: string): Promise<MemberCheckInResult> {
  return safeActionCall(
    () => apiPost<MemberCheckInResult>(MEMBER_PORTAL_RPC_PATHS.MEMBER_CHECK_IN, { p_member_id: memberId }),
    "memberCheckIn",
  );
}

export type ShareRewardResult = {
  success?: boolean;
  error?: string;
  credits?: number;
  /** true = daily cap reached after this share */
  share_claimed_today?: boolean;
  share_credits_today?: number;
  daily_share_cap?: number;
};

/**
 * Step 1: Request a one-time share nonce from the server.
 * The nonce must be presented when claiming the share reward.
 */
export async function requestShareNonce(memberId: string): Promise<{ success: boolean; nonce?: string; error?: string }> {
  return safeActionCall(
    () => apiPost<{ success: boolean; nonce?: string; error?: string }>(
      MEMBER_PORTAL_RPC_PATHS.MEMBER_REQUEST_SHARE_NONCE,
      { p_member_id: memberId },
    ),
    "requestShareNonce",
  );
}

/**
 * Step 2: Claim share reward using the one-time nonce obtained from requestShareNonce.
 */
export async function memberClaimShareReward(memberId: string, shareNonce: string): Promise<ShareRewardResult> {
  return safeActionCall(
    () => apiPost<ShareRewardResult>(
      MEMBER_PORTAL_RPC_PATHS.MEMBER_GRANT_SPIN_FOR_SHARE,
      { p_member_id: memberId, p_share_nonce: shareNonce },
    ),
    "memberClaimShareReward",
  ) as Promise<ShareRewardResult>;
}

export async function fetchMemberInviteToken(memberId: string): Promise<string | null> {
  return safeCall(
    async () => {
      const r = await apiPost<{ success?: boolean; invite_token?: string }>(MEMBER_PORTAL_RPC_PATHS.MEMBER_GET_INVITE_TOKEN, {
        p_member_id: memberId,
      });
      return r?.invite_token ?? null;
    },
    null,
    "fetchMemberInviteToken",
  );
}

/** 会员「我的订单」原始行（由页面侧 mapDbRowToMemberPortalOrderView 映射） */
export async function memberGetOrdersRows(memberId: string): Promise<unknown[]> {
  return safeCall(
    async () => {
      const raw = await apiPost<unknown>(MEMBER_PORTAL_RPC_PATHS.MEMBER_GET_ORDERS, { p_member_id: memberId, p_limit: 20, p_offset: 0 });
      const d = unwrapApiData<unknown>(raw);
      if (d && typeof d === "object" && Array.isArray((d as { rows?: unknown }).rows)) {
        return (d as { rows: unknown[] }).rows;
      }
      return Array.isArray(d) ? d : [];
    },
    [],
    "memberGetOrdersRows",
  );
}

export type MemberOrdersPage = { rows: unknown[]; total: number };

export async function memberGetOrdersPage(memberId: string, limit = 20, offset = 0): Promise<MemberOrdersPage> {
  return safeCall(
    async () => {
      const raw = await apiPost<unknown>(MEMBER_PORTAL_RPC_PATHS.MEMBER_GET_ORDERS, {
        p_member_id: memberId,
        p_limit: limit,
        p_offset: offset,
      });
      const d = unwrapApiData<unknown>(raw);
      if (d && typeof d === "object" && Array.isArray((d as { rows?: unknown }).rows)) {
        const obj = d as { rows: unknown[]; total?: number };
        return { rows: obj.rows, total: Number(obj.total ?? obj.rows.length) };
      }
      const arr = Array.isArray(d) ? d : [];
      return { rows: arr, total: arr.length };
    },
    { rows: [], total: 0 },
    "memberGetOrdersPage",
  );
}

export async function memberUpdateNickname(
  memberId: string,
  nickname: string,
): Promise<{ success?: boolean; error?: string }> {
  return safeActionCall(
    () => apiPost(MEMBER_PORTAL_RPC_PATHS.MEMBER_UPDATE_NICKNAME, {
      p_member_id: memberId,
      p_nickname: nickname.trim(),
    }),
    "memberUpdateNickname",
  );
}

export async function memberUpdateAvatar(
  memberId: string,
  avatarDataUrl: string | null,
): Promise<{ success?: boolean; error?: string }> {
  return safeActionCall(
    () => apiPost(MEMBER_PORTAL_RPC_PATHS.MEMBER_UPDATE_AVATAR, {
      p_member_id: memberId,
      p_avatar_url: avatarDataUrl,
    }),
    "memberUpdateAvatar",
  );
}

export type InviteSubmitResult = { success: boolean; error?: string };

/** 邀请码换取短时一次性 registerToken（服务端校验码与租户，不信任前端 tenant_id） */
export async function memberRegisterInit(code: string): Promise<
  { success: true; registerToken: string; expiresIn: number } | { success: false; error: string }
> {
  try {
    const r = await apiPost<{
      success?: boolean;
      registerToken?: string;
      expiresIn?: number;
      error?: { code?: string };
    }>("/api/member/register-init", { code: code.trim() });
    if (r && typeof r === "object" && r.success === true && typeof r.registerToken === "string") {
      return {
        success: true,
        registerToken: r.registerToken,
        expiresIn: typeof r.expiresIn === "number" ? r.expiresIn : 300,
      };
    }
    const err = (r as { error?: { code?: string } })?.error?.code || "INIT_FAILED";
    return { success: false, error: err };
  } catch (e: unknown) {
    if (e instanceof ApiError && e.statusCode === 429) {
      return { success: false, error: "RATE_LIMIT" };
    }
    if (e instanceof ApiError && e.statusCode === 404) {
      return { success: false, error: "INVALID_CODE" };
    }
    if (e instanceof ApiError && e.statusCode === 403) {
      return { success: false, error: "INVITE_DISABLED" };
    }
    return { success: false, error: "INIT_FAILED" };
  }
}

/**
 * 使用 registerToken 完成注册（与旧 RPC 等价业务，但开户逻辑全在后端）。
 * 仍保留 RPC 路径供兼容：须传 p_register_token。
 */
export async function validateInviteAndSubmit(params: {
  registerToken: string;
  phone: string;
  password: string;
  name?: string | null;
  /** @deprecated 已忽略；租户由服务端从 registerToken 解析 */
  tenantId?: string | null | undefined;
  code?: string | null | undefined;
}): Promise<InviteSubmitResult> {
  try {
    const r = await apiPost<{
      success?: boolean;
      memberId?: string;
      error?: { code?: string };
    }>(MEMBER_PORTAL_RPC_PATHS.MEMBER_REGISTER, {
      registerToken: params.registerToken.trim(),
      phone: params.phone.trim(),
      password: params.password,
      name: params.name ?? undefined,
    });
    if (r && typeof r === "object" && r.success === true) {
      return { success: true };
    }
    const err = (r as { error?: { code?: string } })?.error?.code || "REGISTER_FAILED";
    return { success: false, error: err };
  } catch (e: unknown) {
    if (e instanceof ApiError && e.statusCode === 429) {
      return { success: false, error: "RATE_LIMIT" };
    }
    if (e instanceof ApiError) {
      const c = e.code;
      if (c === "TOKEN_EXPIRED" || c === "INVALID_TOKEN") {
        return { success: false, error: c === "INVALID_TOKEN" ? "INVALID_TOKEN" : "TOKEN_EXPIRED" };
      }
      if (c === "TOKEN_USED" || e.statusCode === 410) {
        return { success: false, error: "TOKEN_USED" };
      }
      if (c === "ALREADY_INVITED" || c === "PHONE_ALREADY_REGISTERED" || e.statusCode === 409) {
        return { success: false, error: c === "PHONE_ALREADY_REGISTERED" ? "PHONE_ALREADY_REGISTERED" : "ALREADY_INVITED" };
      }
      if (c === "SELF_REFERRAL") {
        return { success: false, error: "SELF_REFERRAL" };
      }
    }
    return { success: false, error: "REGISTER_FAILED" };
  }
}
