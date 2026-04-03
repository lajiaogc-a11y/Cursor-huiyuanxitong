/**
 * 会员端通知收件箱（与员工 notifications 表分离）
 */
import { createHash, randomUUID } from 'node:crypto';
import { execute, query, queryOne } from '../../database/index.js';
import { getMemberInboxNotifyPolicy } from './notifyPolicy.js';
import {
  buildAnnouncementInboxCopy,
  buildMallRedemptionInboxCopy,
  buildTradeSpinInboxCopy,
  fetchMemberInboxCopyTemplates,
  type MemberInboxCategory,
} from './copyTemplates.js';

export type { MemberInboxCategory };

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
  if (s === 'trade' || s === 'redemption' || s === 'announcement') return s;
  if (s === 'reward') return 'trade';
  if (s === 'order') return 'redemption';
  if (s === 'activity') return 'announcement';
  return 'other';
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
  category: string;
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
  const tpl = await fetchMemberInboxCopyTemplates(input.tenantId);
  const copy = buildTradeSpinInboxCopy(tpl, { spins: n, orderId: input.orderId });
  await upsertMemberInboxOne({
    tenantId: input.tenantId,
    memberId: input.memberId,
    eventType: 'order_completed_spin',
    dedupeKey,
    category: 'trade',
    title: copy.titleCol,
    body: copy.bodyCol,
    link: '/member/spin',
    metadata: {
      titleZh: copy.titleZh,
      titleEn: copy.titleEn,
      contentZh: copy.contentZh,
      contentEn: copy.contentEn,
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
  const tpl = await fetchMemberInboxCopyTemplates(input.tenantId);
  const copy = buildMallRedemptionInboxCopy(tpl, {
    outcome: input.outcome,
    itemTitle: input.itemTitle,
    quantity: input.quantity,
    points: input.points,
    note: input.note,
  });
  await upsertMemberInboxOne({
    tenantId: input.tenantId,
    memberId: input.memberId,
    eventType: 'mall_redemption',
    dedupeKey,
    category: 'redemption',
    title: copy.titleCol,
    body: copy.bodyCol,
    link: null,
    metadata: {
      titleZh: copy.titleZh,
      titleEn: copy.titleEn,
      contentZh: copy.contentZh,
      contentEn: copy.contentEn,
      redemption_id: input.redemptionId,
      outcome: input.outcome,
    },
  });
}

export async function fanOutAnnouncementInbox(input: {
  tenantId: string;
  dedupeKey: string;
  base: { titleZh: string; titleEn: string; contentZh: string; contentEn: string };
  extraMetadata?: Record<string, unknown>;
}): Promise<number> {
  const policy = await getMemberInboxNotifyPolicy(input.tenantId);
  if (!policy.announcement) return 0;
  const tpl = await fetchMemberInboxCopyTemplates(input.tenantId);
  const built = buildAnnouncementInboxCopy(tpl, input.base);
  const metadata: Record<string, unknown> = {
    ...(input.extraMetadata || {}),
    titleZh: built.titleZh,
    titleEn: built.titleEn,
    contentZh: built.contentZh,
    contentEn: built.contentEn,
    source: 'portal_announcement',
  };
  const dk = input.dedupeKey.slice(0, 191);
  const metaJson = JSON.stringify(metadata);
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
        built.titleCol.slice(0, 512),
        built.bodyCol,
        'announcement',
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
