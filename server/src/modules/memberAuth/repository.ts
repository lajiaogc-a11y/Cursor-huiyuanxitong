/**
 * Member Auth Repository - 会员认证（MySQL 版）
 */
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { query, queryOne, execute } from '../../database/index.js';
import { resolveLevelNameZhForMember } from '../memberLevels/repository.js';

/** 员工要求改密 OR 尚未完成首次门户改密（且未因曾登录被豁免） */
export function memberEffectiveMustChangePassword(mustChangePassword: unknown, firstLoginDone: unknown): boolean {
  const mcp = Number(mustChangePassword) === 1;
  const done = Number(firstLoginDone ?? 0) === 1;
  return mcp || !done;
}

export interface MemberInfo {
  id: string;
  member_code: string;
  phone_number: string;
  nickname: string | null;
  member_level: string | null;
  /** 等级中文名（来自 member_level_rules；无则省略） */
  member_level_zh?: string | null;
  wallet_balance: number;
  tenant_id?: string | null;
  avatar_url?: string | null;
  /** 为 true 时须先改密才能使用会员业务接口 */
  must_change_password?: boolean;
  /** 成功邀请注册人数（members 表单调递增字段，清理 referrals 不减少） */
  invite_success_lifetime_count?: number;
  /** 累计获得积分奖励（流水删除不减少；兑换拒绝退回 redeem_rejected 不计入） */
  lifetime_reward_points_earned?: number;
  /** 晋级用累计积分（与 lifetime 同步递增，删除订单/流水不减少） */
  total_points?: number;
}

export async function verifyMemberPasswordRepository(
  phone: string,
  password: string
): Promise<{ success: boolean; error?: string; member?: MemberInfo }> {
  const row = await queryOne<{
    id: string; member_code: string; phone_number: string;
    nickname: string | null; member_level: string | null;
    current_level_id: string | null;
    wallet_balance: number; password_hash: string | null;
    tenant_id: string | null; avatar_url: string | null;
    must_change_password: number | string | null;
    member_portal_first_login_done: number | string | null;
    invite_success_lifetime_count: number | string | null;
    lifetime_reward_points_earned: number | string | null;
    total_points: number | string | null;
  }>(
    `SELECT id, member_code, phone_number, nickname, member_level, current_level_id, wallet_balance, password_hash, tenant_id, avatar_url,
            COALESCE(must_change_password, 0) AS must_change_password,
            COALESCE(member_portal_first_login_done, 0) AS member_portal_first_login_done,
            COALESCE(invite_success_lifetime_count, 0) AS invite_success_lifetime_count,
            COALESCE(lifetime_reward_points_earned, 0) AS lifetime_reward_points_earned,
            COALESCE(total_points, 0) AS total_points
     FROM members WHERE phone_number = ? OR member_code = ? LIMIT 1`,
    [phone.trim(), phone.trim()]
  );
  if (!row) {
    return { success: false, error: 'MEMBER_NOT_FOUND' };
  }
  if (!row.password_hash) {
    return { success: false, error: 'NO_PASSWORD_SET' };
  }
  const match = await bcrypt.compare(password, row.password_hash);
  if (!match) {
    return { success: false, error: 'WRONG_PASSWORD' };
  }
  const member_level_zh = await resolveLevelNameZhForMember(row.tenant_id, row.current_level_id, row.member_level);
  return {
    success: true,
    member: {
      id: row.id,
      member_code: row.member_code,
      phone_number: row.phone_number,
      nickname: row.nickname,
      member_level: row.member_level,
      member_level_zh: member_level_zh ?? undefined,
      wallet_balance: Number(row.wallet_balance) || 0,
      tenant_id: row.tenant_id,
      avatar_url: row.avatar_url || null,
      must_change_password: memberEffectiveMustChangePassword(row.must_change_password, row.member_portal_first_login_done),
      invite_success_lifetime_count: Math.max(0, Math.floor(Number(row.invite_success_lifetime_count) || 0)),
      lifetime_reward_points_earned: Math.max(0, Number(row.lifetime_reward_points_earned) || 0),
      total_points: Math.max(0, Number(row.total_points) || 0),
    },
  };
}

export async function setMemberPasswordRepository(
  memberId: string,
  oldPassword: string | null,
  newPassword: string
): Promise<{ success: boolean; error?: string }> {
  const row = await queryOne<{ id: string; password_hash: string | null }>(
    `SELECT id, password_hash FROM members WHERE id = ?
     AND (status IS NULL OR LOWER(TRIM(status)) = 'active')`,
    [memberId],
  );
  if (!row) {
    return { success: false, error: 'MEMBER_NOT_FOUND' };
  }
  // 如果已有密码，需要验证旧密码
  if (row.password_hash) {
    if (!oldPassword) {
      return { success: false, error: 'OLD_PASSWORD_REQUIRED' };
    }
    const match = await bcrypt.compare(oldPassword, row.password_hash);
    if (!match) {
      return { success: false, error: 'WRONG_PASSWORD' };
    }
  }
  if (newPassword.length < 6) {
    return { success: false, error: 'PASSWORD_TOO_SHORT' };
  }
  const hash = await bcrypt.hash(newPassword, 10);
  await execute(
    'UPDATE members SET password_hash = ?, must_change_password = 0, member_portal_first_login_done = 1, updated_at = NOW() WHERE id = ?',
    [hash, memberId],
  );
  return { success: true };
}

/**
 * 会员每次密码登录成功时调用：会话序号 +1，使此前其它设备上的 JWT 全部失效。
 * @returns 递增后的序号（写入新 JWT 的 sid）
 */
export async function bumpMemberLoginSessionRepository(memberId: string): Promise<number> {
  await execute(
    `UPDATE members SET member_login_session_seq = COALESCE(member_login_session_seq, 0) + 1 WHERE id = ?`,
    [memberId],
  );
  const row = await queryOne<{ s: number | string }>(
    `SELECT COALESCE(member_login_session_seq, 0) AS s FROM members WHERE id = ? LIMIT 1`,
    [memberId],
  );
  return row ? Number(row.s) || 0 : 0;
}

export type MemberAuthGateResult =
  | { ok: true; mustChangePassword: boolean }
  | { ok: false; reason: 'not_found' | 'replaced' };

/** 会话序号 + 是否强制改密（单查询） */
export async function verifyMemberAuthGateRepository(
  memberId: string,
  tokenSid: unknown,
): Promise<MemberAuthGateResult> {
  const row = await queryOne<{
    s: number | string | null;
    mcp: number | string | null;
    fld: number | string | null;
  }>(
    `SELECT COALESCE(member_login_session_seq, 0) AS s,
            COALESCE(must_change_password, 0) AS mcp,
            COALESCE(member_portal_first_login_done, 0) AS fld
     FROM members WHERE id = ? LIMIT 1`,
    [memberId],
  );
  if (!row) return { ok: false, reason: 'not_found' };
  const dbSeq = Number(row.s ?? 0);
  const jwtSeq =
    typeof tokenSid === 'number' && Number.isFinite(tokenSid)
      ? Math.trunc(tokenSid)
      : typeof tokenSid === 'string' && /^\d+$/.test(tokenSid)
        ? parseInt(tokenSid, 10)
        : 0;
  if (jwtSeq !== dbSeq) return { ok: false, reason: 'replaced' };
  return { ok: true, mustChangePassword: memberEffectiveMustChangePassword(row.mcp, row.fld) };
}

/** 改密成功后重签 JWT */
export async function getMemberTokenClaimsForSignRepository(memberId: string): Promise<{
  phone: string;
  tenant_id: string | null;
  sessionSeq: number;
} | null> {
  const row = await queryOne<{
    phone_number: string;
    tenant_id: string | null;
    s: number | string | null;
  }>(
    `SELECT phone_number, tenant_id, COALESCE(member_login_session_seq, 0) AS s
     FROM members WHERE id = ? AND (status IS NULL OR LOWER(TRIM(status)) = 'active') LIMIT 1`,
    [memberId],
  );
  if (!row) return null;
  return {
    phone: row.phone_number,
    tenant_id: row.tenant_id,
    sessionSeq: Number(row.s) || 0,
  };
}

/** 登录成功：流水 + 最后登录 / 在线时间 */
export async function recordMemberLoginRepository(memberId: string, tenantId: string | null): Promise<void> {
  try {
    await execute(
      `INSERT INTO member_login_logs (id, tenant_id, member_id, login_at) VALUES (?, ?, ?, NOW(3))`,
      [randomUUID(), tenantId, memberId],
    );
  } catch (e) {
    console.warn('[MemberAuth] member_login_logs insert skipped:', (e as Error).message);
  }
  await execute(
    `UPDATE members SET last_login_at = NOW(3), last_seen_at = NOW(3) WHERE id = ?`,
    [memberId],
  );
}

/** 会员端请求心跳：5 分钟内最多写库一次 */
export async function touchMemberLastSeenThrottledRepository(memberId: string): Promise<void> {
  await execute(
    `UPDATE members SET last_seen_at = NOW(3) WHERE id = ?
     AND (last_seen_at IS NULL OR last_seen_at < NOW(3) - INTERVAL 5 MINUTE)`,
    [memberId],
  );
}

export async function getMemberInfoRepository(memberId: string): Promise<{ success: boolean; member?: MemberInfo }> {
  const row = await queryOne<{
    id: string; member_code: string; phone_number: string;
    nickname: string | null; member_level: string | null;
    current_level_id: string | null;
    wallet_balance: number; tenant_id: string | null; avatar_url: string | null;
    must_change_password: number | string | null;
    member_portal_first_login_done: number | string | null;
    invite_success_lifetime_count: number | string | null;
    lifetime_reward_points_earned: number | string | null;
    total_points: number | string | null;
  }>(
    `SELECT id, member_code, phone_number, nickname, member_level, current_level_id, wallet_balance, tenant_id, avatar_url,
            COALESCE(must_change_password, 0) AS must_change_password,
            COALESCE(member_portal_first_login_done, 0) AS member_portal_first_login_done,
            COALESCE(invite_success_lifetime_count, 0) AS invite_success_lifetime_count,
            COALESCE(lifetime_reward_points_earned, 0) AS lifetime_reward_points_earned,
            COALESCE(total_points, 0) AS total_points
     FROM members
     WHERE id = ?
       AND (status IS NULL OR LOWER(TRIM(status)) = 'active')`,
    [memberId]
  );
  if (!row) {
    return { success: false };
  }
  const member_level_zh = await resolveLevelNameZhForMember(row.tenant_id, row.current_level_id, row.member_level);
  return {
    success: true,
    member: {
      id: row.id,
      member_code: row.member_code,
      phone_number: row.phone_number,
      nickname: row.nickname,
      member_level: row.member_level,
      member_level_zh: member_level_zh ?? undefined,
      wallet_balance: Number(row.wallet_balance) || 0,
      tenant_id: row.tenant_id,
      avatar_url: row.avatar_url || null,
      must_change_password: memberEffectiveMustChangePassword(row.must_change_password, row.member_portal_first_login_done),
      invite_success_lifetime_count: Math.max(0, Math.floor(Number(row.invite_success_lifetime_count) || 0)),
      lifetime_reward_points_earned: Math.max(0, Number(row.lifetime_reward_points_earned) || 0),
      total_points: Math.max(0, Number(row.total_points) || 0),
    },
  };
}
