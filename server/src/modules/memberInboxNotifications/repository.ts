/**
 * 会员端通知收件箱（与员工 notifications 表分离）
 */
import { createHash, randomUUID } from 'node:crypto';
import { execute, query, queryOne } from '../../database/index.js';
import { getMemberInboxNotifyPolicy } from './notifyPolicy.js';

export type MemberInboxCategory = 'system' | 'reward' | 'activity' | 'invite' | 'order';

export interface MemberInboxRow {
  id: string;
  tenant_id: string;
  member_id: string;
  event_type: string;
  dedupe_key: string;
  title: string;
  body: string | null;
  category: string;
  link: string | null;
  metadata: unknown;
  is_read: number;
  created_at: Date | string;
}

export interface MemberInboxListItem {
  id: string;
  category: MemberInboxCategory;
  title_zh: string;
  title_en: string;
  content_zh: string;
  content_en: string;
  link: string | null;
  read: boolean;
  created_at: string;
}

function parseMetadata(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (Buffer.isBuffer(raw)) {
    try {
      return JSON.parse(raw.toString('utf8')) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function coerceCategory(raw: string): MemberInboxCategory {
  const s = String(raw || '').toLowerCase();
  if (s === 'reward' || s === 'activity' || s === 'invite' || s === 'order') return s;
  return 'system';
}

export function mapRowToListItem(row: MemberInboxRow): MemberInboxListItem {
  const meta = parseMetadata(row.metadata);
  const titleZh = String(meta.titleZh ?? meta.title_zh ?? row.title ?? '');
  const titleEn = String(meta.titleEn ?? meta.title_en ?? row.title ?? '');
  const contentZh = String(meta.contentZh ?? meta.content_zh ?? row.body ?? '');
  const contentEn = String(meta.contentEn ?? meta.content_en ?? row.body ?? '');
  const created =
    row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? '');
  return {
    id: row.id,
    category: coerceCategory(row.category),
    title_zh: titleZh,
    title_en: titleEn,
    content_zh: contentZh,
    content_en: contentEn,
    link: row.link != null && String(row.link).trim() ? String(row.link) : null,
    read: Number(row.is_read) === 1,
    created_at: created,
  };
}

export async function countUnreadMemberInbox(memberId: string, tenantId: string): Promise<number> {
  const row = await queryOne<{ n: number }>(
    `SELECT COUNT(*) AS n FROM member_inbox_notifications
     WHERE member_id = ? AND tenant_id = ? AND is_read = 0`,
    [memberId, tenantId],
  );
  return Math.max(0, Math.floor(Number(row?.n ?? 0)));
}

export async function listMemberInbox(
  memberId: string,
  tenantId: string,
  limit: number,
): Promise<MemberInboxListItem[]> {
  const lim = Math.min(Math.max(1, Math.floor(limit || 80)), 200);
  const rows = await query<MemberInboxRow>(
    `SELECT id, tenant_id, member_id, event_type, dedupe_key, title, body, category, link, metadata, is_read, created_at
     FROM member_inbox_notifications
     WHERE member_id = ? AND tenant_id = ?
     ORDER BY created_at DESC
     LIMIT ${lim}`,
    [memberId, tenantId],
  );
  return rows.map(mapRowToListItem);
}

export async function markMemberInboxRead(
  memberId: string,
  tenantId: string,
  id: string,
): Promise<boolean> {
  const r = await execute(
    `UPDATE member_inbox_notifications SET is_read = 1 WHERE id = ? AND member_id = ? AND tenant_id = ?`,
    [id, memberId, tenantId],
  );
  return (r as { affectedRows?: number }).affectedRows != null && (r as { affectedRows: number }).affectedRows > 0;
}

export async function markAllMemberInboxRead(memberId: string, tenantId: string): Promise<number> {
  const r = await execute(
    `UPDATE member_inbox_notifications SET is_read = 1 WHERE member_id = ? AND tenant_id = ? AND is_read = 0`,
    [memberId, tenantId],
  );
  return Math.max(0, Math.floor(Number((r as { affectedRows?: number }).affectedRows ?? 0)));
}

export async function deleteMemberInboxRow(
  memberId: string,
  tenantId: string,
  id: string,
): Promise<boolean> {
  const r = await execute(
    `DELETE FROM member_inbox_notifications WHERE id = ? AND member_id = ? AND tenant_id = ?`,
    [id, memberId, tenantId],
  );
  return (r as { affectedRows?: number }).affectedRows != null && (r as { affectedRows: number }).affectedRows > 0;
}

/** 单会员幂等写入（商城兑换结果等） */
export async function upsertMemberInboxOne(input: {
  tenantId: string;
  memberId: string;
  eventType: string;
  dedupeKey: string;
  category: MemberInboxCategory;
  title: string;
  body: string;
  link?: string | null;
  metadata: Record<string, unknown>;
}): Promise<void> {
  const id = randomUUID();
  const metaJson = JSON.stringify(input.metadata);
  await execute(
    `INSERT INTO member_inbox_notifications (
       id, tenant_id, member_id, event_type, dedupe_key, title, body, category, link, metadata, is_read, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), 0, NOW(3))
     ON DUPLICATE KEY UPDATE
       title = VALUES(title),
       body = VALUES(body),
       category = VALUES(category),
       link = VALUES(link),
       metadata = VALUES(metadata),
       is_read = 0`,
    [
      id,
      input.tenantId,
      input.memberId,
      input.eventType,
      input.dedupeKey.slice(0, 191),
      input.title.slice(0, 512),
      input.body,
      input.category,
      input.link ?? null,
      metaJson,
    ],
  );
}

export function hashAnnouncementDedupe(tenantId: string, stable: string): string {
  const h = createHash('sha256').update(`${tenantId}|${stable}`).digest('hex').slice(0, 24);
  return `ann:${tenantId.slice(0, 8)}:${h}`;
}

/** 门户公告：按会员批量插入，重复 dedupe_key 忽略 */
/** 订单完成且已按租户设置发放转盘次数后，写入会员通知（与 spin_credits 发放一致，幂等按 orderId） */
export async function notifyMemberOrderCompletedSpinReward(input: {
  tenantId: string;
  memberId: string;
  orderId: string;
  spins: number;
}): Promise<void> {
  const policy = await getMemberInboxNotifyPolicy(input.tenantId);
  if (!policy.orderSpin) return;
  const n = Math.max(0, Math.floor(Number(input.spins) || 0));
  if (n <= 0) return;
  const dedupeKey = `order_spin_reward:${input.orderId}`.slice(0, 191);
  const titleEn = 'Trade completed';
  const titleZh = '交易完成';
  const bodyEn =
    n === 1
      ? 'Congratulations! Your trade was completed — you earned 1 wheel spin.'
      : `Congratulations! Your trade was completed — you earned ${n} wheel spins.`;
  const bodyZh =
    n === 1
      ? '恭喜您交易成功，获得 1 次转盘抽奖机会！'
      : `恭喜您交易成功，获得 ${n} 次转盘抽奖机会！`;
  await upsertMemberInboxOne({
    tenantId: input.tenantId,
    memberId: input.memberId,
    eventType: 'order_completed_spin',
    dedupeKey,
    category: 'reward',
    title: titleEn,
    body: bodyEn,
    link: '/member/spin',
    metadata: {
      titleZh,
      titleEn,
      contentZh: bodyZh,
      contentEn: bodyEn,
      order_id: input.orderId,
      spins: n,
    },
  });
}

export async function notifyMemberMallRedemptionOutcome(input: {
  tenantId: string;
  memberId: string;
  redemptionId: string;
  outcome: 'completed' | 'rejected';
  itemTitle: string;
  quantity: number;
  points: number;
  note?: string | null;
}): Promise<void> {
  const policy = await getMemberInboxNotifyPolicy(input.tenantId);
  if (!policy.mallRedemption) return;
  const dedupeKey = `mall_rdm:${input.redemptionId}:${input.outcome}`.slice(0, 191);
  const qty = Math.max(1, Math.floor(input.quantity || 1));
  const pts = Math.max(0, Math.floor(Number(input.points) || 0));
  const title = input.outcome === 'completed' ? 'Redemption completed' : 'Redemption rejected';
  const titleZh = input.outcome === 'completed' ? '兑换已完成' : '兑换已驳回';
  let bodyEn: string;
  let bodyZh: string;
  if (input.outcome === 'completed') {
    bodyEn = `Your redemption for "${input.itemTitle}" ×${qty} has been completed.${pts > 0 ? ` ${pts} points were deducted from your frozen balance.` : ''}`;
    bodyZh = `您兑换的「${input.itemTitle}」×${qty} 已处理完成。${pts > 0 ? ` 已从冻结积分中扣除 ${pts} 积分。` : ''}`;
  } else {
    const note = input.note?.trim() ? ` Note: ${input.note.trim()}` : '';
    const noteZh = input.note?.trim() ? ` 说明：${input.note.trim()}` : '';
    bodyEn = `Your redemption for "${input.itemTitle}" was rejected.${pts > 0 ? ` ${pts} points have been returned to your balance.` : ''}${note}`;
    bodyZh = `您兑换的「${input.itemTitle}」已被驳回。${pts > 0 ? ` ${pts} 积分已退回可用余额。` : ''}${noteZh}`;
  }
  await upsertMemberInboxOne({
    tenantId: input.tenantId,
    memberId: input.memberId,
    eventType: 'mall_redemption',
    dedupeKey,
    category: 'order',
    title,
    body: bodyEn,
    link: null,
    metadata: {
      titleZh,
      titleEn: title,
      contentZh: bodyZh,
      contentEn: bodyEn,
      redemption_id: input.redemptionId,
      outcome: input.outcome,
    },
  });
}

export async function fanOutAnnouncementInbox(input: {
  tenantId: string;
  dedupeKey: string;
  title: string;
  body: string;
  metadata: Record<string, unknown>;
}): Promise<number> {
  const policy = await getMemberInboxNotifyPolicy(input.tenantId);
  if (!policy.announcement) return 0;
  const dk = input.dedupeKey.slice(0, 191);
  const metaJson = JSON.stringify(input.metadata);
  const members = await query<{ id: string }>(
    `SELECT id FROM members WHERE tenant_id = ? AND (COALESCE(is_deleted, 0) = 0)`,
    [input.tenantId],
  );
  if (members.length === 0) return 0;

  const CHUNK = 250;
  let inserted = 0;
  for (let i = 0; i < members.length; i += CHUNK) {
    const slice = members.slice(i, i + CHUNK);
    const placeholders: string[] = [];
    const params: unknown[] = [];
    for (const m of slice) {
      placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), 0, NOW(3))');
      params.push(
        randomUUID(),
        input.tenantId,
        m.id,
        'announcement',
        dk,
        input.title.slice(0, 512),
        input.body,
        'activity',
        null,
        metaJson,
      );
    }
    const sql = `INSERT IGNORE INTO member_inbox_notifications (
      id, tenant_id, member_id, event_type, dedupe_key, title, body, category, link, metadata, is_read, created_at
    ) VALUES ${placeholders.join(', ')}`;
    const r = await execute(sql, params);
    inserted += Math.max(0, Math.floor(Number((r as { affectedRows?: number }).affectedRows ?? 0)));
  }
  return inserted;
}
