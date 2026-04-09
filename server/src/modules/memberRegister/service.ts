/**
 * 邀请/推广扫码注册：服务端生成一次性 registerToken，完成注册时强校验并消费 token。
 * 不依赖前端传入 tenant_id，避免伪造租户绕过校验。
 */
import { createHash, randomBytes, randomUUID } from 'crypto';
import { config } from '../../config/index.js';
import { ensureDefaultMemberLevelRulesRepository } from '../memberLevels/repository.js';
import { generateMemberCode } from '../../utils/memberCode.js';
import {
  queryTenantsByInviteCode,
  queryReferrersByInviteCode,
  queryInviteEnabledForTenant,
  insertInviteRegisterToken,
  insertInviteRegisterAudit,
  runInTransaction,
  selectTokenForUpdateOnConn,
  selectReferrerOnConn,
  consumeTokenOnConn,
  checkPhoneExistsOnConn,
  checkMemberCodeExistsOnConn,
  insertMemberOnConn,
  assignLowestLevelOnConn,
  insertReferralOnConn,
  incrementReferrerInviteCountOnConn,
  insertReferralRelationOnConn,
  insertReferralEventOnConn,
  insertMemberOperationLogOnConn,
  consumeTokenFinalOnConn,
} from './repository.js';

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

  const tenants = await queryTenantsByInviteCode(inviteCode);
  if (tenants.length !== 1 || !tenants[0]?.tenant_id) {
    return { ok: false, error: 'INVALID_CODE' };
  }
  const tenantId = tenants[0].tenant_id;

  const referrers = await queryReferrersByInviteCode(tenantId, inviteCode);
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
  await insertInviteRegisterAudit(params);
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

  const enabled = await queryInviteEnabledForTenant(resolved.tenantId);
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
    await insertInviteRegisterToken({
      id,
      tokenHash,
      inviteCode: resolved.inviteCode,
      tenantId: resolved.tenantId,
      referrerId: resolved.referrerId,
      ttlSec: ttl,
      clientIp: opts.clientIp ?? null,
    });
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
    const out = await runInTransaction(async (conn): Promise<InviteRegTxOk | InviteRegTxFail> => {
      const tokenRow = await selectTokenForUpdateOnConn(conn, tokenHash);

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

      const referrer = await selectReferrerOnConn(conn, tokenRow.referrer_id);

      if (!referrer || referrer.tenant_id !== tokenRow.tenant_id) {
        await consumeTokenOnConn(conn, tokenRow.id);
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

      const phoneExists = await checkPhoneExistsOnConn(conn, inviteePhone);
      if (phoneExists) {
        return {
          ok: false,
          error: 'PHONE_ALREADY_REGISTERED',
          audit: { errorCode: 'PHONE_ALREADY_REGISTERED', tokenId: tokenRow.id, tenantId: tokenRow.tenant_id },
        };
      }

      const bcrypt = await import('bcryptjs');
      const passwordHash = rawPassword ? await bcrypt.hash(rawPassword, 10) : null;

      let newMemberCode = '';
      for (let attempt = 0; attempt < 48; attempt++) {
        const candidate = generateMemberCode();
        const exists = await checkMemberCodeExistsOnConn(conn, candidate);
        if (!exists) {
          newMemberCode = candidate;
          break;
        }
      }
      if (!newMemberCode) {
        return {
          ok: false,
          error: 'INTERNAL_ERROR',
          audit: { errorCode: 'MEMBER_CODE_COLLISION', tokenId: tokenRow.id, tenantId: tokenRow.tenant_id },
        };
      }
      const newToken = genMemberInviteToken();
      const newId = randomUUID();
      const nickname =
        params.nickname != null && String(params.nickname).trim()
          ? String(params.nickname).trim().slice(0, 255)
          : null;

      await ensureDefaultMemberLevelRulesRepository(referrer.tenant_id);

      await insertMemberOnConn(conn, {
        id: newId,
        phone: inviteePhone,
        memberCode: newMemberCode,
        inviteToken: newToken,
        passwordHash,
        tenantId: referrer.tenant_id,
        referrerId: referrer.id,
        nickname,
      });

      await assignLowestLevelOnConn(conn, referrer.tenant_id, newId);

      await insertReferralOnConn(conn, referrer.tenant_id, referrer.id, newId);

      await incrementReferrerInviteCountOnConn(conn, referrer.id);

      await insertReferralRelationOnConn(conn, {
        referrerId: referrer.id,
        refereeId: newId,
        referrerPhone: referrer.phone_number || null,
        referrerMemberCode: referrer.member_code || null,
        refereePhone: inviteePhone,
        refereeMemberCode: newMemberCode,
      });

      await insertReferralEventOnConn(conn, referrer.tenant_id, referrer.id, newId);

      // Spin credits are NOT granted at registration time.
      // They are granted on the referee's FIRST LOGIN (see memberAuth/controller.ts → grantReferralSpinsOnFirstLogin).

      await insertMemberOperationLogOnConn(conn, newId, referrer.tenant_id, `Referred by ${referrer.member_code || referrer.id}`);

      const affected = await consumeTokenFinalOnConn(conn, tokenRow.id);
      if (affected !== 1) {
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
