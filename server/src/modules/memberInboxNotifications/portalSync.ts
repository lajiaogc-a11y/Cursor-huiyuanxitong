/**
 * 门户 announcements / 单列 announcement 发布后，与上一版对比，为新出现的条目向全租户会员 fan-out 收件箱
 */
import { createHash } from 'node:crypto';
import { fanOutAnnouncementInbox, hashAnnouncementDedupe } from './repository.js';

function parseJsonArray(v: unknown): unknown[] {
  let raw: unknown = v;
  if (raw == null) return [];
  if (Buffer.isBuffer(raw)) {
    try {
      raw = JSON.parse(raw.toString('utf8'));
    } catch {
      return [];
    }
  }
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(raw) ? raw : [];
}

function effectiveAnnouncementItems(row: Record<string, unknown>): Array<Record<string, unknown>> {
  const parsed = parseJsonArray(row.announcements);
  const usable = parsed.filter((item) => {
    if (!item || typeof item !== 'object') return false;
    const o = item as Record<string, unknown>;
    const title = String(o.title ?? o.subject ?? '').trim();
    const content = String(o.content ?? o.body ?? o.message ?? o.text ?? '').trim();
    const imgRaw = o.image_url ?? o.image ?? o.imageUrl;
    const image_url = imgRaw != null && String(imgRaw).trim() ? String(imgRaw).trim() : '';
    return !!(title || content || image_url);
  });
  if (usable.length > 0) return usable as Record<string, unknown>[];
  const legacy = row.announcement != null ? String(row.announcement).trim() : '';
  if (legacy) return [{ title: '', content: legacy, sort_order: 1, image_url: '' }];
  return [];
}

function stableAnnouncementSignature(o: Record<string, unknown>): string {
  const title_zh = String(o.title_zh ?? o.title ?? o.subject ?? '').trim();
  const title_en = String(o.title_en ?? '').trim();
  const body_zh = String(o.body_zh ?? o.content ?? o.body ?? o.message ?? o.text ?? '').trim();
  const body_en = String(o.body_en ?? '').trim();
  const image_url =
    o.image_url != null && String(o.image_url).trim()
      ? String(o.image_url).trim()
      : o.image != null && String(o.image).trim()
        ? String(o.image).trim()
        : '';
  const sort_order =
    typeof o.sort_order === 'number' && Number.isFinite(o.sort_order) ? o.sort_order : 0;
  const id = o.id != null ? String(o.id).trim() : '';
  const raw = JSON.stringify({
    id,
    sort_order,
    title_zh,
    title_en,
    body_zh,
    body_en,
    image_url,
  });
  return createHash('sha256').update(raw).digest('hex');
}

function bilingualFromItem(o: Record<string, unknown>): {
  titleZh: string;
  titleEn: string;
  bodyZh: string;
  bodyEn: string;
  displayTitle: string;
  displayBody: string;
} {
  const titleZh = String(o.title_zh ?? o.title ?? o.subject ?? '').trim();
  const titleEn = String(o.title_en ?? '').trim();
  const bodyZh = String(o.body_zh ?? o.content ?? o.body ?? o.message ?? o.text ?? '').trim();
  const bodyEn = String(o.body_en ?? '').trim();
  const displayTitle = titleEn || titleZh || 'Announcement';
  const displayBody = bodyEn || bodyZh || '';
  return { titleZh, titleEn, bodyZh, bodyEn, displayTitle, displayBody };
}

export async function syncMemberInboxAfterPortalAnnouncementsChange(
  tenantId: string,
  prevRow: Record<string, unknown> | null,
  nextRow: Record<string, unknown>,
): Promise<void> {
  const prevItems = prevRow ? effectiveAnnouncementItems(prevRow) : [];
  const nextItems = effectiveAnnouncementItems(nextRow);
  const prevSigs = new Set(prevItems.map((it) => stableAnnouncementSignature(it)));

  for (const it of nextItems) {
    const sig = stableAnnouncementSignature(it);
    if (prevSigs.has(sig)) continue;
    const { titleZh, titleEn, bodyZh, bodyEn } = bilingualFromItem(it);
    const dedupeKey = hashAnnouncementDedupe(tenantId, sig);
    await fanOutAnnouncementInbox({
      tenantId,
      dedupeKey,
      base: { titleZh, titleEn, contentZh: bodyZh, contentEn: bodyEn },
    });
  }
}
