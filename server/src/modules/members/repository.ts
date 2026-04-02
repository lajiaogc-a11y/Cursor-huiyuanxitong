/**
 * Members Repository - 唯一可操作 members 表的层
 * 使用 MySQL (mysql2/promise) 直连
 */
import { query, queryOne, execute } from '../../database/index.js';
import { generateMemberCode } from '../../utils/memberCode.js';
import bcrypt from 'bcryptjs';
import type { ListMembersQuery, CreateMemberBody, UpdateMemberBody, BulkCreateMemberItem } from './types.js';
import {
  getLowestMemberLevelRuleRepository,
  getMemberLevelRuleByIdRepository,
  getMemberLevelRuleByNameRepository,
} from '../memberLevels/repository.js';

function generateRandomPassword(length = 8): string {
  const letters = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const all = letters + digits;
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  // 保证至少 1 个字母 + 1 个数字
  let pwd = '';
  pwd += letters[bytes[0] % letters.length];
  pwd += digits[bytes[1] % digits.length];
  for (let i = 2; i < length; i++) {
    pwd += all[bytes[i] % all.length];
  }
  // Fisher-Yates 洗牌，避免固定位置
  const arr = pwd.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = bytes[i] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

/**
 * members.bank_card 为 JSON 列：写入用 JSON.stringify；mysql2 读回时常见为仍带 JSON 字符串引号的文本，
 * 若不解析会在前端显示成 "卡号 姓名" 两侧多双引号。
 */
function bankCardFromDb(raw: unknown): string | null {
  if (raw == null) return null;
  let cur: string;
  if (typeof raw === 'string') cur = raw;
  else if (Buffer.isBuffer(raw)) cur = raw.toString('utf8');
  else cur = String(raw);
  cur = cur.trim();
  if (!cur) return null;
  for (let i = 0; i < 6; i++) {
    if (cur.length < 2 || cur[0] !== '"' || cur[cur.length - 1] !== '"') break;
    try {
      const p = JSON.parse(cur);
      if (typeof p !== 'string') break;
      cur = p;
    } catch {
      break;
    }
  }
  return cur || null;
}

/** 写入 JSON 列前：去掉误带的 JSON 字符串引号，再 JSON.stringify 一次，避免双重引号入库 */
function bankCardToJsonParam(value: string | null | undefined): string | null {
  if (value == null) return null;
  let inner = String(value).trim();
  if (!inner) return null;
  for (let i = 0; i < 6; i++) {
    if (inner.length < 2 || inner[0] !== '"' || inner[inner.length - 1] !== '"') break;
    try {
      const p = JSON.parse(inner);
      if (typeof p !== 'string') break;
      inner = p;
    } catch {
      break;
    }
  }
  return JSON.stringify(inner);
}

function mapMemberRowBankCard(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return row;
  return { ...row, bank_card: bankCardFromDb(row.bank_card) };
}

export async function listMembersRepository(tenantId: string | undefined, q: ListMembersQuery) {
  const effectiveTenantId = q.tenant_id ?? tenantId;
  const page = q.page ?? 1;
  const limit = Math.min(q.limit ?? 50, 10000);
  const offset = (page - 1) * limit;

  let rows: Record<string, unknown>[];
  if (effectiveTenantId) {
    rows = await query(
      `SELECT * FROM members WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [effectiveTenantId, limit, offset]
    );
  } else {
    rows = await query(
      `SELECT * FROM members ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
  }
  return rows.map((r) => mapMemberRowBankCard(r) as (typeof rows)[number]);
}

export async function getMemberByIdRepository(id: string, tenantId: string | undefined) {
  let row;
  if (tenantId) {
    row = await queryOne(`SELECT * FROM members WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
  } else {
    row = await queryOne(`SELECT * FROM members WHERE id = ?`, [id]);
  }
  if (!row) throw Object.assign(new Error('Not found'), { code: 'PGRST116' });
  return mapMemberRowBankCard(row as Record<string, unknown>) as typeof row;
}

/** 从 phone_number 中提取纯数字（去除 +、-、空格、括号等格式字符） */
function stripPhoneFormatting(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

/**
 * 推荐录入：按租户内「会员编号」或「手机号」精确查找。
 * 对所有输入同时尝试 member_code 和 phone_number，避免纯数字会员编号被误判为电话。
 */
export async function lookupMemberForReferralRepository(
  tenantId: string,
  raw: string
): Promise<Record<string, unknown> | null> {
  const q = raw.trim();
  if (!q) return null;

  const codeCleaned = q.replace(/\s+/g, '').toUpperCase();
  const digits = stripPhoneFormatting(q);

  // 1) 按 member_code 精确匹配（去空格、大写化）
  if (codeCleaned.length >= 1) {
    const row = await queryOne(
      `SELECT * FROM members WHERE tenant_id = ? AND UPPER(REPLACE(TRIM(member_code), ' ', '')) = ? LIMIT 1`,
      [tenantId, codeCleaned]
    );
    if (row) return mapMemberRowBankCard(row as Record<string, unknown>)!;
  }

  // 2) 按 phone_number 精确匹配（原始输入）
  let row = await queryOne(
    `SELECT * FROM members WHERE tenant_id = ? AND phone_number = ? LIMIT 1`,
    [tenantId, q]
  );
  if (row) return row;

  // 3) 按 phone_number 精确匹配（仅数字）
  if (digits.length >= 3 && digits !== q) {
    row = await queryOne(
      `SELECT * FROM members WHERE tenant_id = ? AND phone_number = ? LIMIT 1`,
      [tenantId, digits]
    );
    if (row) return mapMemberRowBankCard(row as Record<string, unknown>)!;
  }

  // 4) 去除数据库侧格式后比较（MySQL 8+ REGEXP_REPLACE，单条查询替代 LIMIT 5000 拉全表在 Node 比对）
  if (digits.length >= 6) {
    row = await queryOne(
      `SELECT * FROM members WHERE tenant_id = ?
       AND REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '') = ?
       LIMIT 1`,
      [tenantId, digits]
    );
    if (row) return mapMemberRowBankCard(row as Record<string, unknown>)!;
  }

  // 5) 尾号模糊匹配（仅数字 >= 8 位，DB 侧也提取数字比较）
  if (digits.length >= 8) {
    const suffix = digits.slice(-8);
    const candidates = await query(
      `SELECT * FROM members WHERE tenant_id = ? AND phone_number LIKE ? LIMIT 40`,
      [tenantId, `%${suffix}`]
    );
    for (const r of candidates as Record<string, unknown>[]) {
      const p = stripPhoneFormatting(String((r as { phone_number?: string }).phone_number ?? ''));
      if (p === digits) return mapMemberRowBankCard(r)!;
    }
  }

  // 6) 不限租户兜底：同一系统内电话号码全局唯一，租户可能不匹配
  row = await queryOne(
    `SELECT * FROM members WHERE phone_number = ? LIMIT 1`,
    [q]
  );
  if (row) {
    console.warn(
      `[lookupMember] phone="${q}" found in tenant="${(row as { tenant_id?: string }).tenant_id}" but requested tenant="${tenantId}". Returning cross-tenant match.`
    );
    return mapMemberRowBankCard(row as Record<string, unknown>)!;
  }
  if (digits.length >= 3 && digits !== q) {
    row = await queryOne(
      `SELECT * FROM members WHERE phone_number = ? LIMIT 1`,
      [digits]
    );
    if (row) {
      console.warn(
        `[lookupMember] digits="${digits}" found in tenant="${(row as { tenant_id?: string }).tenant_id}" but requested tenant="${tenantId}". Returning cross-tenant match.`
      );
      return mapMemberRowBankCard(row as Record<string, unknown>)!;
    }
  }

  // 7) 去除格式后不限租户兜底（单条 SQL，避免 LIMIT 10000 + 应用层循环）
  if (digits.length >= 6) {
    row = await queryOne(
      `SELECT * FROM members
       WHERE REGEXP_REPLACE(COALESCE(phone_number,''), '[^0-9]', '') = ?
       LIMIT 1`,
      [digits]
    );
    if (row) {
      console.warn(
        `[lookupMember] digit-match="${digits}" found in tenant="${(row as { tenant_id?: string }).tenant_id}" but requested tenant="${tenantId}". Returning cross-tenant match.`
      );
      return row;
    }
  }

  // 8) member_code 不限租户兜底
  if (codeCleaned.length >= 1) {
    row = await queryOne(
      `SELECT * FROM members WHERE UPPER(REPLACE(TRIM(member_code), ' ', '')) = ? LIMIT 1`,
      [codeCleaned]
    );
    if (row) {
      console.warn(
        `[lookupMember] code="${codeCleaned}" found in tenant="${(row as { tenant_id?: string }).tenant_id}" but requested tenant="${tenantId}". Returning cross-tenant match.`
      );
      return mapMemberRowBankCard(row as Record<string, unknown>)!;
    }
  }

  console.warn(`[lookupMember] no match for q="${q}" (digits="${digits}", code="${codeCleaned}") in tenant="${tenantId}"`);
  return null;
}

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
    `INSERT INTO members (id, tenant_id, phone_number, member_code, nickname, member_level, total_points, current_level_id, currency_preferences, bank_card, common_cards, customer_feature, remark, source_id, creator_id, recorder_id, password_hash, initial_password, member_portal_first_login_done, must_change_password)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`,
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
    throw Object.assign(new Error('未找到该推荐人，请确认手机号或会员编号属于本租户会员'), {
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
    throw Object.assign(new Error('不能将自己设为推荐人'), { code: 'REFERRER_SELF' });
  }
  if (refMember.tenant_id != null && String(refMember.tenant_id) !== String(tenantId)) {
    throw Object.assign(new Error('推荐人不在当前租户'), { code: 'REFERRER_TENANT_MISMATCH' });
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
        throw Object.assign(new Error('该会员编号已被其他会员使用'), { code: 'MEMBER_CODE_TAKEN' });
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
        throw Object.assign(new Error('无效的等级 ID'), { code: 'INVALID_LEVEL_ID' });
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
          throw Object.assign(new Error('该会员编号已被其他会员使用'), { code: 'MEMBER_CODE_TAKEN' });
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
        throw Object.assign(new Error('无效的等级 ID'), { code: 'INVALID_LEVEL_ID' });
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
  await execute(`UPDATE orders SET member_id = NULL WHERE member_id = ?`, [id]);
  await execute(`UPDATE points_ledger SET member_id = NULL WHERE member_id = ?`, [id]);
  await execute(`UPDATE activity_gifts SET member_id = NULL WHERE member_id = ?`, [id]);
  await execute(`DELETE FROM member_activity WHERE member_id = ?`, [id]);
  await execute(`DELETE FROM members WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
}

function isDuplicateKeyError(e: unknown): boolean {
  const err = e as { code?: string; errno?: number };
  return err?.code === 'ER_DUP_ENTRY' || err?.code === '23505' || err?.errno === 1062;
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

  const insertSql = `INSERT INTO members (id, tenant_id, phone_number, member_code, nickname, member_level, total_points, current_level_id, currency_preferences, bank_card, common_cards, customer_feature, remark, source_id, creator_id, password_hash, initial_password, member_portal_first_login_done, must_change_password)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)`;

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

export async function listReferralsRepository(tenantId?: string | null) {
  if (tenantId) {
    return query(
      `SELECT
         COALESCE(rr.referrer_phone, ref_m.phone_number) AS referrer_phone,
         COALESCE(rr.referrer_member_code, ref_m.member_code) AS referrer_member_code,
         COALESCE(rr.referee_phone, ree_m.phone_number) AS referee_phone
       FROM referral_relations rr
       LEFT JOIN members ree_m ON ree_m.id = rr.referee_id
       LEFT JOIN members ref_m ON ref_m.id = rr.referrer_id
       WHERE ree_m.tenant_id = ?`,
      [tenantId]
    );
  }
  return query(
    `SELECT
       COALESCE(rr.referrer_phone, ref_m.phone_number) AS referrer_phone,
       COALESCE(rr.referrer_member_code, ref_m.member_code) AS referrer_member_code,
       COALESCE(rr.referee_phone, ree_m.phone_number) AS referee_phone
     FROM referral_relations rr
     LEFT JOIN members ree_m ON ree_m.id = rr.referee_id
     LEFT JOIN members ref_m ON ref_m.id = rr.referrer_id`
  );
}

export async function getReferrerByRefereePhoneRepository(
  refereePhone: string,
  tenantId?: string | null,
): Promise<{ referrer_phone: string; referrer_member_code: string } | null> {
  const normalized = refereePhone.replace(/\D/g, '');
  const sql = tenantId
    ? `SELECT COALESCE(rr.referrer_phone, ref_m.phone_number) AS referrer_phone,
              COALESCE(rr.referrer_member_code, ref_m.member_code) AS referrer_member_code
       FROM referral_relations rr
       LEFT JOIN members ref_m ON ref_m.id = rr.referrer_id
       LEFT JOIN members ree_m ON ree_m.id = rr.referee_id
       WHERE (rr.referee_phone = ? OR rr.referee_phone = ?)
         AND (ree_m.tenant_id = ? OR ree_m.tenant_id IS NULL)
       LIMIT 1`
    : `SELECT COALESCE(rr.referrer_phone, ref_m.phone_number) AS referrer_phone,
              COALESCE(rr.referrer_member_code, ref_m.member_code) AS referrer_member_code
       FROM referral_relations rr
       LEFT JOIN members ref_m ON ref_m.id = rr.referrer_id
       WHERE (rr.referee_phone = ? OR rr.referee_phone = ?)
       LIMIT 1`;
  const params = tenantId
    ? [refereePhone, normalized, tenantId]
    : [refereePhone, normalized];
  return queryOne<{ referrer_phone: string; referrer_member_code: string }>(sql, params);
}

export async function getCustomerDetailByPhoneRepository(phone: string, tenantId?: string | null): Promise<{
  member: {
    id: string;
    tenant_id: string | null;
    phone_number: string;
    member_code: string;
    member_level: string | null;
    common_cards: string[];
    currency_preferences: string[];
    bank_card: string | null;
    customer_feature: string | null;
    source_id: string | null;
    source_name: string | null;
    remark: string | null;
    created_at: string;
    recorder_name: string | null;
    referrer_display: string | null;
    invite_success_lifetime_count: number;
    lifetime_reward_points_earned: number;
  } | null;
  activity: {
    order_count: number;
    remaining_points: number | null;
    accumulated_profit: number | null;
    accumulated_profit_usdt: number | null;
    total_accumulated_ngn: number | null;
    total_accumulated_ghs: number | null;
    total_accumulated_usdt: number | null;
    referral_count: number;
    consumption_count: number;
  } | null;
}> {
  const normalized = phone.trim();
  if (!normalized) return { member: null, activity: null };

  let member: any;
  if (tenantId) {
    // 与推荐录入同源：支持纯数字等价、尾号匹配等，避免库内带国家码/格式不同导致查不到
    member = await lookupMemberForReferralRepository(tenantId, normalized);
  } else {
    member = await queryOne(
      `SELECT id, phone_number, member_code, member_level, common_cards, currency_preferences, bank_card, customer_feature, source_id, remark, created_at, creator_id,
              invite_success_lifetime_count, lifetime_reward_points_earned
       FROM members WHERE phone_number = ?`,
      [normalized]
    );
    if (!member) {
      const digits = normalized.replace(/\D/g, "");
      if (digits && digits !== normalized) {
        member = await queryOne(
          `SELECT id, phone_number, member_code, member_level, common_cards, currency_preferences, bank_card, customer_feature, source_id, remark, created_at, creator_id,
                  invite_success_lifetime_count, lifetime_reward_points_earned
           FROM members WHERE phone_number = ?`,
          [digits]
        );
      }
    }
    if (!member && normalized.replace(/\D/g, "").length >= 8) {
      const digits = normalized.replace(/\D/g, "");
      const suffix = digits.slice(-8);
      const candidates = await query(
        `SELECT id, phone_number, member_code, member_level, common_cards, currency_preferences, bank_card, customer_feature, source_id, remark, created_at, creator_id,
                invite_success_lifetime_count, lifetime_reward_points_earned
         FROM members WHERE phone_number LIKE ? LIMIT 40`,
        [`%${suffix}`]
      );
      for (const r of candidates as Record<string, unknown>[]) {
        const p = String((r as { phone_number?: string }).phone_number || "").replace(/\D/g, "");
        if (p === digits) {
          member = r;
          break;
        }
      }
    }
  }
  if (!member) return { member: null, activity: null };

  const canonicalPhone = String((member as { phone_number?: string }).phone_number || "").trim();

  const [
    referrerRow,
    activityByPhoneCanon,
    activityByPhoneNorm,
    activityByMember,
    referralsAsReferrerCanon,
    referralsAsReferrerNorm,
    sourceRow,
    recorderRow,
  ] = await Promise.all([
    queryOne(
      `SELECT referrer_phone, referrer_member_code FROM referral_relations 
       WHERE referee_phone = ? OR referee_phone = ? LIMIT 1`,
      [canonicalPhone, normalized]
    ),
    queryOne(
      `SELECT order_count, remaining_points, accumulated_profit, accumulated_profit_usdt, total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt, referral_count
       FROM member_activity WHERE phone_number = ?`,
      [canonicalPhone]
    ),
    canonicalPhone === normalized
      ? Promise.resolve(null)
      : queryOne(
          `SELECT order_count, remaining_points, accumulated_profit, accumulated_profit_usdt, total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt, referral_count
           FROM member_activity WHERE phone_number = ?`,
          [normalized]
        ),
    queryOne(
      `SELECT order_count, remaining_points, accumulated_profit, accumulated_profit_usdt, total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt, referral_count
       FROM member_activity WHERE member_id = ?`,
      [member.id]
    ),
    query(
      `SELECT referee_phone FROM referral_relations WHERE referrer_phone = ?`,
      [canonicalPhone]
    ),
    canonicalPhone === normalized
      ? Promise.resolve([])
      : query(`SELECT referee_phone FROM referral_relations WHERE referrer_phone = ?`, [normalized]),
    member.source_id
      ? queryOne(`SELECT name FROM customer_sources WHERE id = ?`, [member.source_id])
      : Promise.resolve(null),
    member.creator_id
      ? queryOne(`SELECT real_name FROM employees WHERE id = ?`, [member.creator_id])
      : Promise.resolve(null),
  ]);

  const activityByPhone = activityByPhoneCanon || activityByPhoneNorm;
  const activity = activityByPhone || activityByMember;
  const referralsMerged = [
    ...((referralsAsReferrerCanon as { referee_phone?: string }[]) || []),
    ...((referralsAsReferrerNorm as { referee_phone?: string }[]) || []),
  ];
  const referredPhones = [...new Set(referralsMerged.map((r) => r.referee_phone).filter(Boolean))];
  const referralCountAsReferrer = referredPhones.length;

  let consumptionCount = 0;
  if (referredPhones.length > 0) {
    const phPlaceholders = referredPhones.map(() => '?').join(',');
    let countSql = `SELECT COUNT(*) as total FROM orders WHERE phone_number IN (${phPlaceholders}) AND status IN ('completed', 'pending')`;
    const countParams: any[] = [...referredPhones];
    if (tenantId) {
      countSql += ` AND tenant_id = ?`;
      countParams.push(tenantId);
    }
    const countRow = await queryOne<{ total: number }>(countSql, countParams);
    consumptionCount = countRow?.total ?? 0;
  }

  // MySQL 的 JSON 列返回时可能是字符串，需要解析
  const parseJson = (val: any, fallback: any = []) => {
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') { try { return JSON.parse(val); } catch { return fallback; } }
    return fallback;
  };

  return {
    member: {
      id: member.id,
      tenant_id: member.tenant_id != null ? String(member.tenant_id) : null,
      phone_number: member.phone_number,
      member_code: member.member_code,
      member_level: member.member_level || null,
      common_cards: parseJson(member.common_cards, []),
      currency_preferences: parseJson(member.currency_preferences, []),
      bank_card: bankCardFromDb(member.bank_card),
      customer_feature: member.customer_feature || null,
      source_id: member.source_id || null,
      source_name: (sourceRow as any)?.name || null,
      remark: member.remark || null,
      created_at: member.created_at,
      recorder_name: (recorderRow as any)?.real_name || null,
      referrer_display: referrerRow
        ? ((referrerRow as any).referrer_member_code ? `${(referrerRow as any).referrer_member_code} (${(referrerRow as any).referrer_phone})` : (referrerRow as any).referrer_phone)
        : null,
      invite_success_lifetime_count: Math.max(0, Math.floor(Number((member as any).invite_success_lifetime_count) || 0)),
      lifetime_reward_points_earned: Math.max(0, Number((member as any).lifetime_reward_points_earned) || 0),
    },
    activity: activity
      ? {
          order_count: (activity as any).order_count ?? 0,
          remaining_points: (activity as any).remaining_points ?? null,
          accumulated_profit: (activity as any).accumulated_profit ?? null,
          accumulated_profit_usdt: (activity as any).accumulated_profit_usdt ?? null,
          total_accumulated_ngn: (activity as any).total_accumulated_ngn ?? null,
          total_accumulated_ghs: (activity as any).total_accumulated_ghs ?? null,
          total_accumulated_usdt: (activity as any).total_accumulated_usdt ?? null,
          referral_count: (activity as any).referral_count ?? referralCountAsReferrer,
          consumption_count: consumptionCount,
        }
      : {
          order_count: 0,
          remaining_points: null,
          accumulated_profit: null,
          accumulated_profit_usdt: null,
          total_accumulated_ngn: null,
          total_accumulated_ghs: null,
          total_accumulated_usdt: null,
          referral_count: referralCountAsReferrer,
          consumption_count: consumptionCount,
        },
  };
}
