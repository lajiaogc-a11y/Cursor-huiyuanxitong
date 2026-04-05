/**
 * 会员端认证 API（登录 / 改密 / 拉取资料）— 仅供 MemberAuthContext 与兼容层使用。
 */
import { ApiError, apiClient } from "@/lib/apiClient";
import { MEMBER_AUTH_PATHS } from "./routes";

export interface MemberInfo {
  id: string;
  member_code: string;
  phone_number: string;
  nickname: string | null;
  member_level: string | null;
  member_level_zh?: string | null;
  wallet_balance: number;
  tenant_id?: string | null;
  avatar_url?: string | null;
  /** 后端要求先改密才能调用业务接口 */
  must_change_password?: boolean;
  /** 成功邀请注册人数（持久累计） */
  invite_success_lifetime_count?: number;
  /** 累计因邀请获得的抽奖次数（来自 spin_credits 历史，不随设置变动） */
  invite_lifetime_reward_spins?: number;
  /** 累计获得积分奖励（持久累计；与流水清理独立） */
  lifetime_reward_points_earned?: number;
  /** 晋级用累计积分（与正积分流水同步递增） */
  total_points?: number;
}

export async function memberSignIn(
  phone: string,
  password: string,
): Promise<{ success: boolean; member?: MemberInfo; token?: string; message: string }> {
  try {
    const res = await apiClient.post<unknown>(MEMBER_AUTH_PATHS.SIGNIN, { phone: phone.trim(), password });
    const r = res as {
      success?: boolean;
      data?: { member?: MemberInfo; token?: string };
      member?: MemberInfo;
      token?: string;
      message?: string;
    };
    const member = r?.member ?? r?.data?.member;
    const token = r?.token ?? r?.data?.token;
    const ok = (r?.success === true || !!member?.id) && !!member?.id;
    if (ok) {
      return {
        success: true,
        token,
        member: {
          id: member.id,
          member_code: member.member_code,
          phone_number: member.phone_number,
          nickname: member.nickname ?? null,
          member_level: member.member_level ?? null,
          member_level_zh: (member as { member_level_zh?: string | null }).member_level_zh ?? null,
          wallet_balance: Number(member.wallet_balance) || 0,
          tenant_id: (member as { tenant_id?: string | null }).tenant_id ?? null,
          avatar_url: member.avatar_url?.trim() ? member.avatar_url : null,
          must_change_password: !!(member as { must_change_password?: boolean }).must_change_password,
          invite_success_lifetime_count: Math.max(
            0,
            Math.floor(Number((member as { invite_success_lifetime_count?: unknown }).invite_success_lifetime_count) || 0),
          ),
          invite_lifetime_reward_spins: Math.max(
            0,
            Math.floor(Number((member as { invite_lifetime_reward_spins?: unknown }).invite_lifetime_reward_spins) || 0),
          ),
          lifetime_reward_points_earned: Math.max(
            0,
            Number((member as { lifetime_reward_points_earned?: unknown }).lifetime_reward_points_earned) || 0,
          ),
          total_points: Math.max(
            0,
            Number((member as { total_points?: unknown }).total_points) || 0,
          ),
        },
        message: "Welcome back!",
      };
    }
    const failBody = r as { code?: string; message?: string };
    return {
      success: false,
      message: failBody?.message ?? "Login failed",
      code: typeof failBody?.code === "string" ? failBody.code : undefined,
    };
  } catch (e: unknown) {
    if (e instanceof ApiError) {
      return { success: false, message: e.message, code: e.code };
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("ECONNREFUSED")) {
      console.error("[MemberAuth] signin network error:", e);
      return { success: false, message: "无法连接服务器，请检查网络连接后重试" };
    }
    return { success: false, message: msg || "Network error" };
  }
}

function mapMemberPayload(m: Record<string, unknown>): MemberInfo {
  return {
    id: String(m.id),
    member_code: String(m.member_code ?? ""),
    phone_number: String(m.phone_number ?? ""),
    nickname: (m.nickname as string | null) ?? null,
    member_level: (m.member_level as string | null) ?? null,
    member_level_zh: (m.member_level_zh as string | null | undefined) ?? null,
    wallet_balance: Number(m.wallet_balance) || 0,
    tenant_id: (m.tenant_id as string | null) ?? null,
    avatar_url: m.avatar_url && String(m.avatar_url).trim() ? String(m.avatar_url) : null,
    must_change_password: m.must_change_password === true || Number(m.must_change_password) === 1,
    invite_success_lifetime_count: Math.max(0, Math.floor(Number(m.invite_success_lifetime_count) || 0)),
    invite_lifetime_reward_spins: Math.max(0, Math.floor(Number(m.invite_lifetime_reward_spins) || 0)),
    lifetime_reward_points_earned: Math.max(0, Number(m.lifetime_reward_points_earned) || 0),
    total_points: Math.max(0, Number(m.total_points) || 0),
  };
}

export async function memberSetPassword(
  _memberId: string,
  oldPassword: string,
  newPassword: string,
): Promise<{
  success: boolean;
  message: string;
  token?: string;
  member?: MemberInfo;
}> {
  try {
    const raw = await apiClient.post<unknown>(MEMBER_AUTH_PATHS.SET_PASSWORD, {
      old_password: oldPassword,
      new_password: newPassword,
    });
    const top = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    const inner =
      top.data && typeof top.data === "object" ? (top.data as Record<string, unknown>) : top;
    const token = typeof inner.token === "string" ? inner.token : undefined;
    const memRaw = inner.member && typeof inner.member === "object" ? (inner.member as Record<string, unknown>) : null;

    if (token && memRaw) {
      return {
        success: true,
        message: typeof top.message === "string" ? top.message : "Password updated",
        token,
        member: mapMemberPayload(memRaw),
      };
    }
    if (top.success === true) {
      return {
        success: true,
        message: typeof top.message === "string" ? top.message : "Password updated",
        token,
        member: undefined,
      };
    }
    return { success: false, message: typeof top.message === "string" ? top.message : "Failed" };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { success: false, message: msg || "Network error" };
  }
}

export async function memberGetInfo(memberId: string): Promise<MemberInfo | null> {
  try {
    const res = await apiClient.get<unknown>(MEMBER_AUTH_PATHS.info(memberId));
    const r = res as { success?: boolean; data?: { member?: MemberInfo }; member?: MemberInfo };
    const member = r?.member ?? r?.data?.member;
    if (member?.id) {
      return mapMemberPayload(member as unknown as Record<string, unknown>);
    }
    return null;
  } catch (e: unknown) {
    if (e instanceof ApiError && e.code === 'MEMBER_MUST_CHANGE_PASSWORD') {
      return MUST_CHANGE_PASSWORD_SENTINEL;
    }
    return null;
  }
}

/**
 * Sentinel value: memberGetInfo returns this when the server responds with
 * MEMBER_MUST_CHANGE_PASSWORD (403). Callers should check via
 * `isMustChangePasswordResult()` and NOT treat it as "session invalid".
 */
const MUST_CHANGE_PASSWORD_SENTINEL: MemberInfo = Object.freeze({
  id: '__must_change_password__',
  member_code: '',
  phone_number: '',
  nickname: null,
  member_level: null,
  wallet_balance: 0,
  must_change_password: true,
});

export function isMustChangePasswordResult(m: MemberInfo | null): boolean {
  return m?.id === '__must_change_password__';
}
