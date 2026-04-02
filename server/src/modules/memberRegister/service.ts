/**
 * 邀请/推广扫码注册：服务端生成一次性 registerToken，完成注册时强校验并消费 token。
 * 不依赖前端传入 tenant_id，避免伪造租户绕过校验。
 */
import { createHash, randomBytes, randomUUID } from 'crypto';
import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { query, execute, withTransaction } from '../../database/index.js';
import { config } from '../../config/index.js';
import { ensureDefaultMemberLevelRulesRepository } from '../memberLevels/repository.js';
import { incrementLotterySpinBalanceConn } from '../lottery/spinBalanceAccount.js';

type ReferrerResolved = {
  tenantId: string;
  referrerId: string;
  memberCode: string | null;
  refPhone: string | null;
  inviteCode: string;
};

export async function resolveReferrerForInviteCode(rawCode: string): Promise<
  ({ ok: true } & ReferrerResolved) | { ok: false; error: 'INVALID_CODE' }
> {
  const inviteCode = String(rawCode || '').trim();
  if (!inviteCode) return { ok: false, error: 'INVALID_CODE' };

  const tenants = await query<{ tenant_id: string }>(
    `SELECT DISTINCT tenant_id FROM members
     WHERE tenant_id IS NOT NULL
       AND (BINARY invite_token = ? OR (referral_code IS NOT NULL AND referral_code <> '' AND BINARY referral_code = ?))`,
    [inviteCode, inviteCode],
  );
  if (tenants.length !== 1 || !tenants[0]?.tenant_id) {
    return { ok: false, error: 'INVALID_CODE' };
  }
  const tenantId = tenants[0].tenant_id;

  const referrers = await query<{ id: string; member_code: string | null; phone_number: string | null }>(
    `SELECT id, member_code, phone_number FROM members
     WHERE tenant_id = ? AND tenant_id IS NOT NULL
       AND (BINARY referral_code = ? OR BINARY invite_token = ?)`,
    [tenantId, inviteCode, inviteCode],
  );
  if (referrers.length !== 1) {
    return { ok: false, error: 'INVALID_CODE' };
  }
  const r = referrers[0];
  return {
    ok: true,
    tenantId,
    referrerId: r.id,
    memberCode: r.member_code,
    refPhone: r.phone_number,
    inviteCode,
  };
}

async function isInviteEnabledForTenant(tenantId: string): Promise<boolean> {
  const rows = await query<{ enable_invite: number | boolean | string | null }>(
    `SELECT enable_invite FROM member_portal_settings WHERE tenant_id = ? LIMIT 1`,
    [tenantId],
  );
  if (!rows.length) return true;
  const v = rows[0].enable_invite;
  if (v === false || v === 0 || v === '0') return false;
  return true;
}

export function hashRegisterToken(plain: string): string {
  return createHash('sha256').update(plain, 'utf8').digest('hex');
}

function genMemberInviteToken(): string {
  const alphabet = 'abcdefghijkmnpqrstuvwxyz23456789';
  return Array.from({ length: 8 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

export async function writeInviteRegisterAudit(params: {
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

export type InitInviteRegisterResult =
  | { success: true; registerToken: string; expiresIn: number }
  | { success: false; error: string };

export async function initInviteRegisterToken(
  rawCode: string,
  opts: { clientIp?: string | null; userAgent?: string | null },
): Promise<InitInviteRegisterResult> {
  const resolved = await resolveReferrerForInviteCode(rawCode);
  if (!resolved.ok) {
    await writeInviteRegisterAudit({
      action: 'init_fail',
      inviteCode: String(rawCode || '').trim() || null,
      errorCode: 'INVALID_CODE',
      clientIp: opts.clientIp ?? null,
      userAgent: opts.userAgent ?? null,
    });
    return { success: false, error: 'INVALID_CODE' };
  }

  const enabled = await isInviteEnabledForTenant(resolved.tenantId);
  if (!enabled) {
    await writeInviteRegisterAudit({
      action: 'init_fail',
      inviteCode: resolved.inviteCode,
      tenantId: resolved.tenantId,
      errorCode: 'INVITE_DISABLED',
      clientIp: opts.clientIp ?? null,
      userAgent: opts.userAgent ?? null,
    });
    return { success: false, error: 'INVITE_DISABLED' };
  }

  const plainToken = randomBytes(32).toString('hex');
  const tokenHash = hashRegisterToken(plainToken);
  const id = randomUUID();
  const ttl = config.inviteRegisterTokenTtlSec;
  try {
    await execute(
      `INSERT INTO invite_register_tokens (id, token_hash, invite_code, tenant_id, referrer_id, expires_at, created_ip, created_at)
       VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(3), INTERVAL ? SECOND), ?, NOW(3))`,
      [id, tokenHash, resolved.inviteCode, resolved.tenantId, resolved.referrerId, ttl, opts.clientIp ?? null],
    );
  } catch (e) {
    console.error('[inviteRegister] init insert', e);
    return { success: false, error: 'INIT_FAILED' };
  }

  await writeInviteRegisterAudit({
    action: 'init_ok',
    inviteCode: resolved.inviteCode,
    tenantId: resolved.tenantId,
    tokenId: id,
    clientIp: opts.clientIp ?? null,
    userAgent: opts.userAgent ?? null,
  });

  return { success: true, registerToken: plainToken, expiresIn: ttl };
}

export type CompleteInviteRegisterResult =
  | { success: true; member_id: string; member_code: string }
  | { success: false; error: string };

type InviteRegTxFail = {
  ok: false;
  error: string;
  audit: { errorCode: string; tokenId?: string; tenantId?: string };
};
type InviteRegTxOk = {
  ok: true;
  member_id: string;
  member_code: string;
  audit: { inviteCode: string; tenantId: string; tokenId: string };
};

export async function completeInviteRegister(params: {
  registerToken: string;
  inviteePhone: string;
  password: string;
  nickname?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
}): Promise<CompleteInviteRegisterResult> {
  const plain = String(params.registerToken || '').trim();
  const inviteePhone = String(params.inviteePhone || '').trim();
  const rawPassword = String(params.password || '');
  if (!plain || !inviteePhone) {
    return { success: false, error: 'INVALID_INPUT' };
  }
  const tokenHash = hashRegisterToken(plain);

  try {
    const out = await withTransaction(async (conn): Promise<InviteRegTxOk | InviteRegTxFail> => {
      const [tokRows] = await conn.query<RowDataPacket[]>(
        `SELECT id, invite_code, tenant_id, referrer_id, expires_at, used_at
         FROM invite_register_tokens WHERE token_hash = ? FOR UPDATE`,
        [tokenHash],
      );
      const tokenRow = tokRows[0] as
        | {
            id: string;
            invite_code: string;
            tenant_id: string;
            referrer_id: string;
            expires_at: Date;
            used_at: Date | null;
          }
        | undefined;

      if (!tokenRow) {
        return { ok: false, error: 'INVALID_TOKEN', audit: { errorCode: 'INVALID_TOKEN' } };
      }
      if (tokenRow.used_at) {
        return {
          ok: false,
          error: 'TOKEN_USED',
          audit: { errorCode: 'TOKEN_USED', tokenId: tokenRow.id, tenantId: tokenRow.tenant_id },
        };
      }
      const expMs = new Date(tokenRow.expires_at).getTime();
      if (Number.isFinite(expMs) && expMs < Date.now()) {
        return {
          ok: false,
          error: 'TOKEN_EXPIRED',
          audit: { errorCode: 'TOKEN_EXPIRED', tokenId: tokenRow.id, tenantId: tokenRow.tenant_id },
        };
      }

      const [refRows] = await conn.query<RowDataPacket[]>(
        `SELECT id, tenant_id, member_code, phone_number FROM members WHERE id = ? LIMIT 1`,
        [tokenRow.referrer_id],
      );
      const referrer = refRows[0] as
        | { id: string; tenant_id: string; member_code: string | null; phone_number: string | null }
        | undefined;

      if (!referrer || referrer.tenant_id !== tokenRow.tenant_id) {
        await conn.query(`UPDATE invite_register_tokens SET used_at = NOW(3) WHERE id = ? AND used_at IS NULL`, [
          tokenRow.id,
        ]);
        return {
          ok: false,
          error: 'INVALID_REFERRER',
          audit: { errorCode: 'INVALID_REFERRER', tokenId: tokenRow.id, tenantId: tokenRow.tenant_id },
        };
      }

      if (referrer.phone_number && referrer.phone_number.trim() === inviteePhone) {
        return {
          ok: false,
          error: 'SELF_REFERRAL',
          audit: { errorCode: 'SELF_REFERRAL', tokenId: tokenRow.id, tenantId: tokenRow.tenant_id },
        };
      }

      const [exRows] = await conn.query<RowDataPacket[]>(`SELECT id FROM members WHERE phone_number = ? LIMIT 1`, [
        inviteePhone,
      ]);
      if (exRows.length > 0) {
        return {
          ok: false,
          error: 'ALREADY_INVITED',
          audit: { errorCode: 'ALREADY_INVITED', tokenId: tokenRow.id, tenantId: tokenRow.tenant_id },
        };
      }

      const bcrypt = await import('bcryptjs');
      const passwordHash = rawPassword ? await bcrypt.hash(rawPassword, 10) : null;
      const newMemberCode =
        'M' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
      const newToken = genMemberInviteToken();
      const newId = randomUUID();
      const nickname =
        params.nickname != null && String(params.nickname).trim()
          ? String(params.nickname).trim().slice(0, 255)
          : null;

      await ensureDefaultMemberLevelRulesRepository(referrer.tenant_id);

      await conn.query(
        `INSERT INTO members (id, phone_number, member_code, invite_token, referral_code, password_hash, tenant_id, referrer_id, referrer_bound_at, referral_source, status, member_portal_first_login_done, nickname, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3), 'link', 'active', 1, ?, NOW(3), NOW(3))`,
        [
          newId,
          inviteePhone,
          newMemberCode,
          newToken,
          newToken,
          passwordHash,
          referrer.tenant_id,
          referrer.id,
          nickname,
        ],
      );

      const [lowRows] = await conn.query<RowDataPacket[]>(
        `SELECT id, level_name FROM member_level_rules WHERE tenant_id = ? ORDER BY level_order ASC, required_points ASC, id ASC LIMIT 1`,
        [referrer.tenant_id],
      );
      const low = lowRows[0] as { id: string; level_name: string } | undefined;
      if (low) {
        await conn.query(
          `UPDATE members SET member_level = ?, current_level_id = ?, total_points = 0 WHERE id = ?`,
          [low.level_name, low.id, newId],
        );
      }

      await conn.query(
        `INSERT INTO referrals (id, tenant_id, referrer_id, referee_id, created_at) VALUES (?, ?, ?, ?, NOW(3))`,
        [randomUUID(), referrer.tenant_id, referrer.id, newId],
      );

      await conn.query(
        `UPDATE members SET invite_count = invite_count + 1,
            invite_success_lifetime_count = invite_success_lifetime_count + 1,
            updated_at = NOW(3) WHERE id = ?`,
        [referrer.id],
      );

      try {
        await conn.query(
          `INSERT IGNORE INTO referral_relations (id, referrer_id, referee_id, level, referrer_phone, referrer_member_code, referee_phone, referee_member_code, source, created_at)
           VALUES (UUID(), ?, ?, 1, ?, ?, ?, ?, 'link', NOW(3))`,
          [referrer.id, newId, referrer.phone_number || null, referrer.member_code || null, inviteePhone, newMemberCode],
        );
      } catch {
        /* best-effort */
      }

      const evId = randomUUID();
      let eventInserted = false;
      try {
        const [insEv] = await conn.query(
          `INSERT INTO referral_events (id, tenant_id, referrer_id, referee_id, event_type, event_value, created_at)
           VALUES (?, ?, ?, ?, 'register', NULL, NOW(3))`,
          [evId, referrer.tenant_id, referrer.id, newId],
        );
        eventInserted = (insEv as ResultSetHeader).affectedRows === 1;
      } catch {
        eventInserted = false;
      }

      const [portalRows] = await conn.query<RowDataPacket[]>(
        `SELECT invite_reward_spins FROM member_portal_settings WHERE tenant_id = ? LIMIT 1`,
        [referrer.tenant_id],
      );
      const portalRow = portalRows[0] as { invite_reward_spins?: number } | undefined;
      const rewardSpins = Number(portalRow?.invite_reward_spins ?? 3);
      if (eventInserted && rewardSpins > 0) {
        await conn.query(
          'INSERT INTO spin_credits (id, member_id, amount, source, created_at) VALUES (UUID(), ?, ?, ?, NOW(3))',
          [referrer.id, rewardSpins, 'referral'],
        );
        await incrementLotterySpinBalanceConn(conn, referrer.id, rewardSpins);
        await conn.query(
          'INSERT INTO spin_credits (id, member_id, amount, source, created_at) VALUES (UUID(), ?, ?, ?, NOW(3))',
          [newId, rewardSpins, 'invite_welcome'],
        );
        await incrementLotterySpinBalanceConn(conn, newId, rewardSpins);
      }

      try {
        await conn.query(
          `INSERT INTO member_operation_logs (id, member_id, tenant_id, action, detail, created_at) VALUES (UUID(), ?, ?, 'register_via_invite', ?, NOW(3))`,
          [newId, referrer.tenant_id, `Referred by ${referrer.member_code || referrer.id}`],
        );
      } catch {
        /* optional */
      }

      const [upd] = await conn.query(`UPDATE invite_register_tokens SET used_at = NOW(3) WHERE id = ? AND used_at IS NULL`, [
        tokenRow.id,
      ]);
      if ((upd as ResultSetHeader).affectedRows !== 1) {
        throw new Error('TOKEN_CONSUME_RACE');
      }

      return {
        ok: true,
        member_id: newId,
        member_code: newMemberCode,
        audit: {
          inviteCode: tokenRow.invite_code,
          tenantId: tokenRow.tenant_id,
          tokenId: tokenRow.id,
        },
      };
    });

    if (out.ok) {
      await writeInviteRegisterAudit({
        action: 'register_ok',
        inviteCode: out.audit.inviteCode,
        tenantId: out.audit.tenantId,
        tokenId: out.audit.tokenId,
        clientIp: params.clientIp ?? null,
        userAgent: params.userAgent ?? null,
      });
      return { success: true, member_id: out.member_id, member_code: out.member_code };
    }

    await writeInviteRegisterAudit({
      action: 'register_fail',
      tenantId: out.audit.tenantId ?? null,
      tokenId: out.audit.tokenId ?? null,
      errorCode: out.audit.errorCode,
      clientIp: params.clientIp ?? null,
      userAgent: params.userAgent ?? null,
    });
    return { success: false, error: out.error };
  } catch (e) {
    console.error('[inviteRegister] complete', e);
    await writeInviteRegisterAudit({
      action: 'register_fail',
      errorCode: 'REGISTER_FAILED',
      clientIp: params.clientIp ?? null,
      userAgent: params.userAgent ?? null,
    });
    return { success: false, error: 'REGISTER_FAILED' };
  }
}
