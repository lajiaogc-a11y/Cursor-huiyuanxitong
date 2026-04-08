/**
 * Members repository — list / get / referral lookup
 */
import { query, queryOne, execute } from '../../database/index.js';
import type { ListMembersQuery } from './types.js';
import { mapMemberRowBankCard } from './membersRepositoryHelpers.js';

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
export function stripPhoneFormatting(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

export type LookupMemberForReferralOptions = {
  /**
   * 为 true 时，租户内未命中会按手机号/编号全库兜底（易把 A 租户会员匹配到 B 租户操作上下文）。
   * 默认 false：严格租户隔离（汇率页 / 客户详情 / 推荐录入均应按当前租户）。
   */
  allowCrossTenantFallback?: boolean;
};

/**
 * 推荐录入：按租户内「会员编号」或「手机号」精确查找。
 * 对所有输入同时尝试 member_code 和 phone_number，避免纯数字会员编号被误判为电话。
 */
export async function lookupMemberForReferralRepository(
  tenantId: string,
  raw: string,
  options?: LookupMemberForReferralOptions,
): Promise<Record<string, unknown> | null> {
  void options;
  const allowCrossTenantFallback = false;
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

  if (!allowCrossTenantFallback) {
    console.warn(
      `[lookupMember] no match for q="${q}" (digits="${digits}", code="${codeCleaned}") in tenant="${tenantId}" (strict, no cross-tenant fallback)`,
    );
    return null;
  }

  // 6) 不限租户兜底（仅 allowCrossTenantFallback：历史兼容，多租户下易导致错绑会员）
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
