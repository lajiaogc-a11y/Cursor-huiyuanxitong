/**
 * MemberRegister Repository — 邀请注册相关表的唯一 DB 层
 */
import { randomUUID } from 'crypto';
import { query, execute, withTransaction } from '../../database/index.js';
import type { PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

export { withTransaction as runInTransaction };

// ── Pre-transaction queries ──

export async function queryTenantsByInviteCode(inviteCode: string): Promise<{ tenant_id: string }[]> {
  return query<{ tenant_id: string }>(
    `SELECT DISTINCT tenant_id FROM members
     WHERE tenant_id IS NOT NULL
       AND (BINARY invite_token = ? OR (referral_code IS NOT NULL AND referral_code <> '' AND BINARY referral_code = ?))`,
    [inviteCode, inviteCode],
  );
}

export async function queryReferrersByInviteCode(
  tenantId: string,
  inviteCode: string,
): Promise<{ id: string; member_code: string | null; phone_number: string | null }[]> {
  return query<{ id: string; member_code: string | null; phone_number: string | null }>(
    `SELECT id, member_code, phone_number FROM members
     WHERE tenant_id = ? AND tenant_id IS NOT NULL
       AND (BINARY referral_code = ? OR BINARY invite_token = ?)`,
    [tenantId, inviteCode, inviteCode],
  );
}

export async function queryInviteEnabledForTenant(tenantId: string): Promise<boolean> {
  const rows = await query<{ enable_invite: number | boolean | string | null }>(
    `SELECT enable_invite FROM member_portal_settings WHERE tenant_id = ? LIMIT 1`,
    [tenantId],
  );
  if (!rows.length) return true;
  const v = rows[0].enable_invite;
  if (v === false || v === 0 || v === '0') return false;
  return true;
}

export async function insertInviteRegisterToken(params: {
  id: string;
  tokenHash: string;
  inviteCode: string;
  tenantId: string;
  referrerId: string;
  ttlSec: number;
  clientIp: string | null;
}): Promise<void> {
  await execute(
    `INSERT INTO invite_register_tokens (id, token_hash, invite_code, tenant_id, referrer_id, expires_at, created_ip, created_at)
     VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(3), INTERVAL ? SECOND), ?, NOW(3))`,
    [params.id, params.tokenHash, params.inviteCode, params.tenantId, params.referrerId, params.ttlSec, params.clientIp],
  );
}

export async function insertInviteRegisterAudit(params: {
  action: string;
  inviteCode?: string | null;
  tenantId?: string | null;
  tokenId?: string | null;
  errorCode?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await execute(
      `INSERT INTO invite_register_audit (id, action, invite_code, tenant_id, token_id, error_code, client_ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
      [
        randomUUID(),
        params.action,
        params.inviteCode ?? null,
        params.tenantId ?? null,
        params.tokenId ?? null,
        params.errorCode ?? null,
        params.clientIp ?? null,
        params.userAgent ?? null,
      ],
    );
  } catch {
    /* best-effort */
  }
}

// ── Transaction-scoped (conn) functions ──

export interface TokenRow {
  id: string;
  invite_code: string;
  tenant_id: string;
  referrer_id: string;
  expires_at: Date;
  used_at: Date | null;
}

export async function selectTokenForUpdateOnConn(conn: PoolConnection, tokenHash: string): Promise<TokenRow | undefined> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, invite_code, tenant_id, referrer_id, expires_at, used_at
     FROM invite_register_tokens WHERE token_hash = ? FOR UPDATE`,
    [tokenHash],
  );
  return rows[0] as TokenRow | undefined;
}

export async function selectReferrerOnConn(
  conn: PoolConnection,
  referrerId: string,
): Promise<{ id: string; tenant_id: string; member_code: string | null; phone_number: string | null } | undefined> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, tenant_id, member_code, phone_number FROM members WHERE id = ? LIMIT 1`,
    [referrerId],
  );
  return rows[0] as { id: string; tenant_id: string; member_code: string | null; phone_number: string | null } | undefined;
}

export async function consumeTokenOnConn(conn: PoolConnection, tokenId: string): Promise<void> {
  await conn.query(`UPDATE invite_register_tokens SET used_at = NOW(3) WHERE id = ? AND used_at IS NULL`, [tokenId]);
}

export async function checkPhoneExistsOnConn(conn: PoolConnection, phone: string): Promise<boolean> {
  const [rows] = await conn.query<RowDataPacket[]>(`SELECT id FROM members WHERE phone_number = ? LIMIT 1`, [phone]);
  return rows.length > 0;
}

export async function checkMemberCodeExistsOnConn(conn: PoolConnection, code: string): Promise<boolean> {
  const [rows] = await conn.query<RowDataPacket[]>(`SELECT id FROM members WHERE member_code = ? LIMIT 1`, [code]);
  return rows.length > 0;
}

export async function insertMemberOnConn(
  conn: PoolConnection,
  params: {
    id: string;
    phone: string;
    memberCode: string;
    inviteToken: string;
    passwordHash: string | null;
    tenantId: string;
    referrerId: string;
    nickname: string | null;
  },
): Promise<void> {
  await conn.query(
    `INSERT INTO members (id, phone_number, member_code, invite_token, referral_code, password_hash, tenant_id, referrer_id, referrer_bound_at, referral_source, registration_source, status, member_portal_first_login_done, nickname, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3), 'link', 'invite_register', 'active', 1, ?, NOW(3), NOW(3))`,
    [params.id, params.phone, params.memberCode, params.inviteToken, params.inviteToken, params.passwordHash, params.tenantId, params.referrerId, params.nickname],
  );
}

export async function assignLowestLevelOnConn(conn: PoolConnection, tenantId: string, memberId: string): Promise<void> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id, level_name FROM member_level_rules WHERE tenant_id = ? ORDER BY level_order ASC, required_points ASC, id ASC LIMIT 1`,
    [tenantId],
  );
  const low = rows[0] as { id: string; level_name: string } | undefined;
  if (low) {
    await conn.query(
      `UPDATE members SET member_level = ?, current_level_id = ?, total_points = 0 WHERE id = ?`,
      [low.level_name, low.id, memberId],
    );
  }
}

export async function insertReferralOnConn(conn: PoolConnection, tenantId: string, referrerId: string, refereeId: string): Promise<void> {
  await conn.query(
    `INSERT INTO referrals (id, tenant_id, referrer_id, referee_id, created_at) VALUES (?, ?, ?, ?, NOW(3))`,
    [randomUUID(), tenantId, referrerId, refereeId],
  );
}

export async function incrementReferrerInviteCountOnConn(conn: PoolConnection, referrerId: string): Promise<void> {
  await conn.query(
    `UPDATE members SET invite_count = invite_count + 1,
        invite_success_lifetime_count = invite_success_lifetime_count + 1,
        updated_at = NOW(3) WHERE id = ?`,
    [referrerId],
  );
}

export async function insertReferralRelationOnConn(
  conn: PoolConnection,
  params: { referrerId: string; refereeId: string; referrerPhone: string | null; referrerMemberCode: string | null; refereePhone: string; refereeMemberCode: string },
): Promise<void> {
  try {
    await conn.query(
      `INSERT IGNORE INTO referral_relations (id, referrer_id, referee_id, level, referrer_phone, referrer_member_code, referee_phone, referee_member_code, source, created_at)
       VALUES (UUID(), ?, ?, 1, ?, ?, ?, ?, 'link', NOW(3))`,
      [params.referrerId, params.refereeId, params.referrerPhone, params.referrerMemberCode, params.refereePhone, params.refereeMemberCode],
    );
  } catch {
    /* best-effort */
  }
}

export async function insertReferralEventOnConn(conn: PoolConnection, tenantId: string, referrerId: string, refereeId: string): Promise<boolean> {
  try {
    const evId = randomUUID();
    const [result] = await conn.query(
      `INSERT INTO referral_events (id, tenant_id, referrer_id, referee_id, event_type, event_value, created_at)
       VALUES (?, ?, ?, ?, 'register', NULL, NOW(3))`,
      [evId, tenantId, referrerId, refereeId],
    );
    return (result as ResultSetHeader).affectedRows === 1;
  } catch {
    return false;
  }
}

export async function insertMemberOperationLogOnConn(conn: PoolConnection, memberId: string, tenantId: string, detail: string): Promise<void> {
  try {
    await conn.query(
      `INSERT INTO member_operation_logs (id, member_id, tenant_id, action, detail, created_at) VALUES (UUID(), ?, ?, 'register_via_invite', ?, NOW(3))`,
      [memberId, tenantId, detail],
    );
  } catch {
    /* optional */
  }
}

export async function consumeTokenFinalOnConn(conn: PoolConnection, tokenId: string): Promise<number> {
  const [upd] = await conn.query(`UPDATE invite_register_tokens SET used_at = NOW(3) WHERE id = ? AND used_at IS NULL`, [tokenId]);
  return (upd as ResultSetHeader).affectedRows;
}
