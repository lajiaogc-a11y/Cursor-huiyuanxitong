/**
 * Members repository — referrals & customer detail
 */
import { query, queryOne } from '../../database/index.js';
import { bankCardFromDb, mapMemberRowBankCard } from './membersRepositoryHelpers.js';
import { lookupMemberForReferralRepository } from './membersQueryRepository.js';
import { resolveLevelNameZhForMember } from '../memberLevels/repository.js';

export async function listReferralsRepository(tenantId?: string | null) {
  if (!tenantId) return [];
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
         AND ree_m.tenant_id = ?
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
  const result = await queryOne<{ referrer_phone: string; referrer_member_code: string }>(sql, params);
  console.log(`[ReferrerRepo] phone=${refereePhone} normalized=${normalized} tenantId=${tenantId ?? 'null'} found=${!!result}`);
  return result;
}

export async function getCustomerDetailByPhoneRepository(phone: string, tenantId?: string | null): Promise<{
  member: {
    id: string;
    tenant_id: string | null;
    phone_number: string;
    member_code: string;
    member_level: string | null;
    member_level_zh: string | null;
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
    memberLevelZhResolved,
  ] = await Promise.all([
    tenantId
      ? queryOne(
          `SELECT rr.referrer_phone, rr.referrer_member_code
           FROM referral_relations rr
           LEFT JOIN members ree_m ON ree_m.id = rr.referee_id
           WHERE (rr.referee_phone = ? OR rr.referee_phone = ?)
             AND ree_m.tenant_id = ?
           LIMIT 1`,
          [canonicalPhone, normalized, tenantId],
        )
      : queryOne(
          `SELECT referrer_phone, referrer_member_code FROM referral_relations
           WHERE referee_phone = ? OR referee_phone = ? LIMIT 1`,
          [canonicalPhone, normalized],
        ),
    tenantId
      ? queryOne(
          `SELECT order_count, remaining_points, accumulated_profit, accumulated_profit_usdt, total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt, referral_count
           FROM member_activity WHERE phone_number = ? AND tenant_id = ?`,
          [canonicalPhone, tenantId],
        )
      : queryOne(
          `SELECT order_count, remaining_points, accumulated_profit, accumulated_profit_usdt, total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt, referral_count
           FROM member_activity WHERE phone_number = ?`,
          [canonicalPhone],
        ),
    canonicalPhone === normalized
      ? Promise.resolve(null)
      : tenantId
        ? queryOne(
            `SELECT order_count, remaining_points, accumulated_profit, accumulated_profit_usdt, total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt, referral_count
             FROM member_activity WHERE phone_number = ? AND tenant_id = ?`,
            [normalized, tenantId],
          )
        : queryOne(
            `SELECT order_count, remaining_points, accumulated_profit, accumulated_profit_usdt, total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt, referral_count
             FROM member_activity WHERE phone_number = ?`,
            [normalized],
          ),
    tenantId
      ? queryOne(
          `SELECT order_count, remaining_points, accumulated_profit, accumulated_profit_usdt, total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt, referral_count
           FROM member_activity WHERE member_id = ? AND tenant_id = ?`,
          [member.id, tenantId],
        )
      : queryOne(
          `SELECT order_count, remaining_points, accumulated_profit, accumulated_profit_usdt, total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt, referral_count
           FROM member_activity WHERE member_id = ?`,
          [member.id],
        ),
    tenantId
      ? query(
          `SELECT rr.referee_phone
           FROM referral_relations rr
           LEFT JOIN members ref_m ON ref_m.id = rr.referrer_id
           WHERE rr.referrer_phone = ? AND ref_m.tenant_id = ?`,
          [canonicalPhone, tenantId],
        )
      : query(
          `SELECT referee_phone FROM referral_relations WHERE referrer_phone = ?`,
          [canonicalPhone],
        ),
    canonicalPhone === normalized
      ? Promise.resolve([])
      : tenantId
        ? query(
            `SELECT rr.referee_phone
             FROM referral_relations rr
             LEFT JOIN members ref_m ON ref_m.id = rr.referrer_id
             WHERE rr.referrer_phone = ? AND ref_m.tenant_id = ?`,
            [normalized, tenantId],
          )
        : query(`SELECT referee_phone FROM referral_relations WHERE referrer_phone = ?`, [normalized]),
    member.source_id
      ? queryOne(`SELECT name FROM customer_sources WHERE id = ?`, [member.source_id])
      : Promise.resolve(null),
    member.creator_id
      ? queryOne(`SELECT real_name FROM employees WHERE id = ?`, [member.creator_id])
      : Promise.resolve(null),
    resolveLevelNameZhForMember(
      (member as { tenant_id?: string | null }).tenant_id ?? null,
      (member as { current_level_id?: string | null }).current_level_id ?? null,
      (member as { member_level?: string | null }).member_level ?? null,
    ),
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
      member_level_zh: memberLevelZhResolved || null,
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
