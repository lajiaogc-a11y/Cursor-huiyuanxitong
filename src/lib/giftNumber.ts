/**
 * 活动赠送「赠送编号」：短格式 G + yymmdd + 4 位字母数字（约 11 位），避免 GIFT-250309-1234 偏长。
 * 不含易混字符 0/O、1/I。
 */

const ALPHANUM = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function randomGiftSuffix(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += ALPHANUM[Math.floor(Math.random() * ALPHANUM.length)];
  }
  return s;
}

/** 生成一条候选编号（不查重） */
export function buildShortGiftNumberCandidate(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `G${yy}${mm}${dd}${randomGiftSuffix(4)}`;
}

/**
 * 表格展示：有 gift_number 原样；无则用语义化短码（UUID 去横杠后 8 位），避免整段 UUID 占满列。
 */
export function formatDisplayGiftNumber(
  giftNumber: string | null | undefined,
  id: string | null | undefined
): string {
  const g = giftNumber != null ? String(giftNumber).trim() : '';
  if (g) return g;
  const raw = id != null ? String(id).replace(/-/g, '') : '';
  if (raw.length >= 8) return `#${raw.slice(-8).toUpperCase()}`;
  if (raw.length > 0) return `#${raw.toUpperCase()}`;
  return '—';
}
