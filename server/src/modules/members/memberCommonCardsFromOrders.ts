/**
 * 根据订单管理中的交易记录汇总卡片名称，写入 members.common_cards（去重、排序）。
 * 优先 orders.card_name 快照，缺省时用 gift_cards.name（order_type → gift_cards.id）。
 */
import { query, execute } from '../../database/index.js';

function phoneDigits(raw: string): string {
  return String(raw || '').replace(/\D/g, '');
}

export async function syncMemberCommonCardsFromOrdersRepository(
  memberId: string,
  tenantId: string,
  canonicalPhone: string
): Promise<string[]> {
  const mid = String(memberId || '').trim();
  const tid = String(tenantId || '').trim();
  if (!mid || !tid) return [];

  const digits = phoneDigits(canonicalPhone);

  const rows = await query<{ x: string }>(
    `SELECT DISTINCT TRIM(t.x) AS x
     FROM (
       SELECT COALESCE(NULLIF(TRIM(o.card_name), ''), NULLIF(TRIM(g.name), '')) AS x
       FROM orders o
       LEFT JOIN gift_cards g
         ON o.order_type = g.id
         AND (g.tenant_id = o.tenant_id OR g.tenant_id IS NULL)
       WHERE o.tenant_id = ?
         AND (o.is_deleted IS NULL OR o.is_deleted = 0)
         AND LOWER(COALESCE(o.status, '')) NOT IN ('cancelled')
         AND (
           o.member_id = ?
           OR (
             (o.member_id IS NULL OR TRIM(CAST(o.member_id AS CHAR)) = '')
             AND ? <> ''
             AND REGEXP_REPLACE(COALESCE(o.phone_number, ''), '[^0-9]', '') = ?
           )
         )
     ) AS t
     WHERE t.x IS NOT NULL AND CHAR_LENGTH(TRIM(t.x)) > 0
     ORDER BY x`,
    [tid, mid, digits, digits]
  );

  const names = (rows as { x: string }[])
    .map((r) => String(r.x || '').trim())
    .filter(Boolean);

  await execute(`UPDATE members SET common_cards = ? WHERE id = ? AND tenant_id = ?`, [
    JSON.stringify(names),
    mid,
    tid,
  ]);

  return names;
}
