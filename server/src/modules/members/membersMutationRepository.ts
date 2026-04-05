/**
 * Members repository — create / update / delete / bulk create
 */
import { query, queryOne, execute } from '../../database/index.js';
import { generateMemberCode } from '../../utils/memberCode.js';
import bcrypt from 'bcryptjs';
import type { CreateMemberBody, UpdateMemberBody, BulkCreateMemberItem } from './types.js';
import {
  getLowestMemberLevelRuleRepository,
  getMemberLevelRuleByIdRepository,
  getMemberLevelRuleByNameRepository,
} from '../memberLevels/repository.js';
import {
  bankCardToJsonParam,
  generateRandomPassword,
  mapMemberRowBankCard,
  isDuplicateKeyError,
} from './membersRepositoryHelpers.js';
import { lookupMemberForReferralRepository, stripPhoneFormatting } from './membersQueryRepository.js';

export async function createMemberRepository(tenantId: string, body: CreateMemberBody) {
  const { randomUUID } = await import('crypto');
  const id = randomUUID();
  const memberCode = body.member_code ?? generateMemberCode();
  const low = await getLowestMemberLevelRuleRepository(tenantId);
  const memberLevel = low?.level_name ?? 'Starter';
  const currentLevelId = low?.id ?? null;
  const currencyPreferences = JSON.stringify(body.currency_preferences ?? []);
  const bankCard = bankCardToJsonParam(body.bank_card);
  const commonCards = JSON.stringify(body.common_cards ?? []);
  const customerFeature = body.customer_feature ?? null;
  const remark = body.remark ?? null;
  const sourceId = body.source_id ?? null;
  const creatorId = body.creator_id ?? body.recorder_id ?? null;
  const recorderId = body.recorder_id ?? null;

  const initialPassword = generateRandomPassword();
  const passwordHash = await bcrypt.hash(initialPassword, 10);

  await execute(
    `INSERT INTO members (id, tenant_id, phone_number, member_code, nickname, member_level, total_points, current_level_id, currency_preferences, bank_card, common_cards, customer_feature, remark, source_id, creator_id, recorder_id, password_hash, initial_password, member_portal_first_login_done, must_change_password, registration_source)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 'admin_create')`,
    [
      id,
      tenantId,
      body.phone_number,
      memberCode,
      memberCode,
      memberLevel,
      currentLevelId,
      currencyPreferences,
      bankCard,
      commonCards,
      customerFeature,
      remark,
      sourceId,
      creatorId,
      recorderId,
      passwordHash,
      initialPassword,
    ]
  );

  const inserted = await queryOne(`SELECT * FROM members WHERE id = ?`, [id]);
  return mapMemberRowBankCard(inserted as Record<string, unknown>) as typeof inserted;
}

/**
 * 同步会员推荐人：与 listReferrals / 前端合并逻辑一致，写入 referral_relations，并维护 members.referrer_*、referrals。
 */
async function applyMemberReferrerSync(memberId: string, tenantId: string, referrerPhoneInput: string | null): Promise<void> {
  const self = await queryOne<{ phone_number: string | null; member_code: string | null }>(
    `SELECT phone_number, member_code FROM members WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [memberId, tenantId]
  );
  if (!self) {
    throw Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' });
  }

  const refereePhone = String(self.phone_number ?? '').trim();
  const refereeDigits = stripPhoneFormatting(refereePhone);

  const clearReferrer = async () => {
    await execute(`DELETE FROM referral_relations WHERE referee_id = ?`, [memberId]);
    if (refereePhone) {
      await execute(`DELETE FROM referral_relations WHERE referee_phone = ? OR referee_phone = ?`, [
        refereePhone,
        refereeDigits || refereePhone,
      ]);
    }
    await execute(`UPDATE members SET referrer_id = NULL, referrer_phone = NULL WHERE id = ? AND tenant_id = ?`, [
      memberId,
      tenantId,
    ]);
    try {
      await execute(`DELETE FROM referrals WHERE referee_id = ?`, [memberId]);
    } catch {
      /* 极旧库可能无 referrals */
    }
  };

  const raw = referrerPhoneInput == null ? '' : String(referrerPhoneInput).trim();
  if (!raw) {
    await clearReferrer();
    return;
  }

  const refMemberRaw = await lookupMemberForReferralRepository(tenantId, raw);
  if (!refMemberRaw || !(refMemberRaw as { id?: string }).id) {
    throw Object.assign(new Error('Referrer not found'), {
      code: 'REFERRER_NOT_FOUND',
    });
  }
  const refMember = refMemberRaw as {
    id: string;
    tenant_id?: string | null;
    phone_number?: string | null;
    member_code?: string | null;
  };
  if (refMember.id === memberId) {
    throw Object.assign(new Error('Cannot set yourself as your own referrer'), { code: 'REFERRER_SELF' });
  }
  if (refMember.tenant_id != null && String(refMember.tenant_id) !== String(tenantId)) {
    throw Object.assign(new Error('Referrer not in current tenant'), { code: 'REFERRER_TENANT_MISMATCH' });
  }

  await clearReferrer();

  const refPhone = String(refMember.phone_number ?? '').trim();
  const refCode = String(refMember.member_code ?? '').trim();
  const refereeCode = String(self.member_code ?? '').trim();

  const { randomUUID } = await import('crypto');
  const rrId = randomUUID();
  await execute(
    `INSERT INTO referral_relations (id, referrer_id, referee_id, level, referrer_phone, referrer_member_code, referee_phone, referee_member_code, source, created_at)
     VALUES (?, ?, ?, 1, ?, ?, ?, ?, 'manual', NOW(3))`,
    [rrId, refMember.id, memberId, refPhone || null, refCode || null, refereePhone || null, refereeCode || null]
  );

  try {
    await execute(
      `INSERT INTO referrals (id, tenant_id, referrer_id, referee_id, created_at) VALUES (?, ?, ?, ?, NOW(3))`,
      [randomUUID(), tenantId, refMember.id, memberId]
    );
  } catch {
    /* best-effort：表不存在或约束冲突 */
  }

  await execute(`UPDATE members SET referrer_id = ?, referrer_phone = ? WHERE id = ? AND tenant_id = ?`, [
    refMember.id,
    refPhone || null,
    memberId,
    tenantId,
  ]);
}

export async function updateMemberRepository(id: string, tenantId: string, body: UpdateMemberBody) {
  const hasReferrerUpdate = Object.prototype.hasOwnProperty.call(body as Record<string, unknown>, 'referrer_phone');

  if (hasReferrerUpdate) {
    await applyMemberReferrerSync(id, tenantId, body.referrer_phone ?? null);
  }

  const setClauses: string[] = [];
  const params: any[] = [];

  if (body.member_code !== undefined) {
    const code = String(body.member_code).trim();
    if (code) {
      const clash = await queryOne<{ id: string }>(
        'SELECT id FROM members WHERE tenant_id = ? AND member_code = ? AND id <> ? LIMIT 1',
        [tenantId, code, id]
      );
      if (clash) {
        throw Object.assign(new Error('This user code is already in use'), { code: 'MEMBER_CODE_TAKEN' });
      }
      setClauses.push('member_code = ?');
      params.push(code);
    }
  }

  let levelHandled = false;
  if (body.current_level_id !== undefined) {
    const rawId = body.current_level_id;
    if (rawId != null && String(rawId).trim() !== '') {
      const rule = await getMemberLevelRuleByIdRepository(String(rawId).trim(), tenantId);
      if (!rule) {
        throw Object.assign(new Error('Invalid level ID'), { code: 'INVALID_LEVEL_ID' });
      }
      setClauses.push('current_level_id = ?');
      params.push(rule.id);
      setClauses.push('member_level = ?');
      params.push(rule.level_name);
    } else {
      setClauses.push('current_level_id = NULL');
    }
    levelHandled = true;
  }
  if (!levelHandled && body.member_level !== undefined) {
    const rule = await getMemberLevelRuleByNameRepository(tenantId, String(body.member_level));
    if (rule) {
      setClauses.push('current_level_id = ?');
      params.push(rule.id);
      setClauses.push('member_level = ?');
      params.push(rule.level_name);
    } else {
      setClauses.push('member_level = ?');
      params.push(body.member_level);
      setClauses.push('current_level_id = NULL');
    }
  }
  if (body.currency_preferences !== undefined) { setClauses.push('currency_preferences = ?'); params.push(JSON.stringify(body.currency_preferences)); }
  if (body.bank_card !== undefined) { setClauses.push('bank_card = ?'); params.push(bankCardToJsonParam(body.bank_card)); }
  if (body.common_cards !== undefined) { setClauses.push('common_cards = ?'); params.push(JSON.stringify(body.common_cards)); }
  if (body.customer_feature !== undefined) { setClauses.push('customer_feature = ?'); params.push(body.customer_feature); }
  if (body.remark !== undefined) { setClauses.push('remark = ?'); params.push(body.remark); }
  if (body.source_id !== undefined) { setClauses.push('source_id = ?'); params.push(body.source_id); }
  if (body.nickname !== undefined) { setClauses.push('nickname = ?'); params.push(body.nickname === '' ? null : body.nickname); }

  if (setClauses.length === 0 && !hasReferrerUpdate) {
    const r = await queryOne(`SELECT * FROM members WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
    return mapMemberRowBankCard(r as Record<string, unknown>) as typeof r;
  }

  if (setClauses.length > 0) {
    params.push(id, tenantId);
    await execute(
      `UPDATE members SET ${setClauses.join(', ')} WHERE id = ? AND tenant_id = ?`,
      params
    );
  }

  const row = await queryOne(`SELECT * FROM members WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
  if (!row) {
    throw Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' });
  }
  return mapMemberRowBankCard(row as Record<string, unknown>) as typeof row;
}

export async function updateMemberByPhoneRepository(phone: string, tenantId: string, body: UpdateMemberBody) {
  const hasReferrerUpdate = Object.prototype.hasOwnProperty.call(body as Record<string, unknown>, 'referrer_phone');

  if (hasReferrerUpdate) {
    const idRow = await queryOne<{ id: string }>(
      `SELECT id FROM members WHERE phone_number = ? AND tenant_id = ? LIMIT 1`,
      [phone, tenantId]
    );
    if (!idRow) {
      throw Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' });
    }
    await applyMemberReferrerSync(idRow.id, tenantId, body.referrer_phone ?? null);
  }

  const setClauses: string[] = [];
  const params: any[] = [];

  if (body.member_code !== undefined) {
    const code = String(body.member_code).trim();
    if (code) {
      const self = await queryOne<{ id: string }>(
        'SELECT id FROM members WHERE phone_number = ? AND tenant_id = ? LIMIT 1',
        [phone, tenantId]
      );
      if (self) {
        const clash = await queryOne<{ id: string }>(
          'SELECT id FROM members WHERE tenant_id = ? AND member_code = ? AND id <> ? LIMIT 1',
          [tenantId, code, self.id]
        );
        if (clash) {
          throw Object.assign(new Error('This user code is already in use'), { code: 'MEMBER_CODE_TAKEN' });
        }
      }
      setClauses.push('member_code = ?');
      params.push(code);
    }
  }

  let levelHandled = false;
  if (body.current_level_id !== undefined) {
    const rawId = body.current_level_id;
    if (rawId != null && String(rawId).trim() !== '') {
      const rule = await getMemberLevelRuleByIdRepository(String(rawId).trim(), tenantId);
      if (!rule) {
        throw Object.assign(new Error('Invalid level ID'), { code: 'INVALID_LEVEL_ID' });
      }
      setClauses.push('current_level_id = ?');
      params.push(rule.id);
      setClauses.push('member_level = ?');
      params.push(rule.level_name);
    } else {
      setClauses.push('current_level_id = NULL');
    }
    levelHandled = true;
  }
  if (!levelHandled && body.member_level !== undefined) {
    const rule = await getMemberLevelRuleByNameRepository(tenantId, String(body.member_level));
    if (rule) {
      setClauses.push('current_level_id = ?');
      params.push(rule.id);
      setClauses.push('member_level = ?');
      params.push(rule.level_name);
    } else {
      setClauses.push('member_level = ?');
      params.push(body.member_level);
      setClauses.push('current_level_id = NULL');
    }
  }
  if (body.currency_preferences !== undefined) { setClauses.push('currency_preferences = ?'); params.push(JSON.stringify(body.currency_preferences)); }
  if (body.bank_card !== undefined) { setClauses.push('bank_card = ?'); params.push(bankCardToJsonParam(body.bank_card)); }
  if (body.common_cards !== undefined) { setClauses.push('common_cards = ?'); params.push(JSON.stringify(body.common_cards)); }
  if (body.customer_feature !== undefined) { setClauses.push('customer_feature = ?'); params.push(body.customer_feature); }
  if (body.remark !== undefined) { setClauses.push('remark = ?'); params.push(body.remark); }
  if (body.source_id !== undefined) { setClauses.push('source_id = ?'); params.push(body.source_id); }
  if (body.nickname !== undefined) { setClauses.push('nickname = ?'); params.push(body.nickname === '' ? null : body.nickname); }

  if (setClauses.length === 0 && !hasReferrerUpdate) {
    const r = await queryOne(`SELECT * FROM members WHERE phone_number = ? AND tenant_id = ?`, [phone, tenantId]);
    return mapMemberRowBankCard(r as Record<string, unknown>) as typeof r;
  }

  if (setClauses.length > 0) {
    params.push(phone, tenantId);
    await execute(
      `UPDATE members SET ${setClauses.join(', ')} WHERE phone_number = ? AND tenant_id = ?`,
      params
    );
  }

  const row = await queryOne(`SELECT * FROM members WHERE phone_number = ? AND tenant_id = ?`, [phone, tenantId]);
  if (!row) {
    throw Object.assign(new Error('Member not found'), { code: 'NOT_FOUND' });
  }
  return mapMemberRowBankCard(row as Record<string, unknown>) as typeof row;
}

export async function deleteMemberRepository(id: string, tenantId: string): Promise<void> {
  // Core FK cleanup (must succeed)
  await execute(`UPDATE orders SET member_id = NULL WHERE member_id = ?`, [id]);
  await execute(`UPDATE points_ledger SET member_id = NULL WHERE member_id = ?`, [id]);
  await execute(`UPDATE activity_gifts SET member_id = NULL WHERE member_id = ?`, [id]);
  await execute(`DELETE FROM member_activity WHERE member_id = ?`, [id]);

  // C1 fix: full FK cleanup matching admin delete path to prevent orphaned data
  try { await execute(`DELETE FROM points_ledger WHERE member_id = ?`, [id]); } catch { /* already NULLed above */ }
  try { await execute(`DELETE FROM points_accounts WHERE member_id = ?`, [id]); } catch { /* best-effort */ }
  const fkCleanups = [
    `DELETE FROM check_ins WHERE member_id = ?`,
    `DELETE FROM spin_credits WHERE member_id = ?`,
    `DELETE FROM spins WHERE member_id = ?`,
    `DELETE FROM redemptions WHERE member_id = ?`,
    `DELETE FROM member_login_logs WHERE member_id = ?`,
    `DELETE FROM member_transactions WHERE member_id = ?`,
    `UPDATE referrals SET referee_id = NULL WHERE referee_id = ?`,
    `UPDATE referrals SET referrer_id = NULL WHERE referrer_id = ?`,
    `UPDATE referral_relations SET referee_id = NULL WHERE referee_id = ?`,
    `UPDATE referral_relations SET referrer_id = NULL WHERE referrer_id = ?`,
    `UPDATE referral_events SET referee_id = NULL WHERE referee_id = ?`,
    `UPDATE referral_events SET referrer_id = NULL WHERE referrer_id = ?`,
    `UPDATE gift_cards SET member_id = NULL WHERE member_id = ?`,
  ];
  for (const sql of fkCleanups) {
    try { await execute(sql, [id]); } catch { /* table may not exist */ }
  }

  await execute(`DELETE FROM members WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
}

/** 管理端重置会员登录密码 */
export async function updateMemberPasswordHashByMemberId(memberId: string, passwordHash: string): Promise<number> {
  const result = await execute(
    'UPDATE members SET password_hash = ?, must_change_password = 1, updated_at = NOW() WHERE id = ?',
    [passwordHash, memberId],
  );
  return result.affectedRows ?? 0;
}

/**
 * 批量创建：逐行 INSERT，遇唯一键冲突（手机号/编号等）跳过该行，避免整批失败。
 * 自动生成的 member_code 冲突时会重试新编号（显式 member_code 冲突则跳过）。
 */
export async function bulkCreateMembersRepository(
  tenantId: string,
  items: BulkCreateMemberItem[],
): Promise<{ id: string; phone_number: string }[]> {
  if (items.length === 0) return [];

  const low = await getLowestMemberLevelRuleRepository(tenantId);
  const defaultLevelName = low?.level_name ?? 'Starter';
  const defaultLevelId = low?.id ?? null;

  const { randomUUID } = await import('crypto');
  const createdIds: string[] = [];

  const insertSql = `INSERT INTO members (id, tenant_id, phone_number, member_code, nickname, member_level, total_points, current_level_id, currency_preferences, bank_card, common_cards, customer_feature, remark, source_id, creator_id, password_hash, initial_password, member_portal_first_login_done, must_change_password, registration_source)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, 'bulk_import')`;

  for (const item of items) {
    const explicitCode =
      item.member_code != null && String(item.member_code).trim() !== ''
        ? String(item.member_code).trim()
        : null;
    const maxAttempts = explicitCode ? 1 : 8;
    let inserted = false;

    for (let attempt = 0; attempt < maxAttempts && !inserted; attempt++) {
      const id = randomUUID();
      const memberCode = explicitCode ?? generateMemberCode();
      const initialPassword = generateRandomPassword();
      const passwordHash = await bcrypt.hash(initialPassword, 10);
      try {
        await execute(insertSql, [
          id,
          tenantId,
          item.phone_number,
          memberCode,
          item.nickname != null && String(item.nickname).trim() !== '' ? String(item.nickname).trim() : null,
          defaultLevelName,
          defaultLevelId,
          JSON.stringify(item.currency_preferences ?? []),
          bankCardToJsonParam(item.bank_card),
          JSON.stringify(item.common_cards ?? []),
          item.customer_feature ?? null,
          item.remark ?? null,
          item.source_id ?? null,
          item.creator_id ?? null,
          passwordHash,
          initialPassword,
        ]);
        createdIds.push(id);
        inserted = true;
      } catch (e) {
        if (!isDuplicateKeyError(e)) throw e;
        if (explicitCode) break;
      }
    }
  }

  if (createdIds.length === 0) return [];
  return query<{ id: string; phone_number: string }>(
    `SELECT id, phone_number FROM members WHERE id IN (${createdIds.map(() => '?').join(',')})`,
    createdIds,
  );
}
