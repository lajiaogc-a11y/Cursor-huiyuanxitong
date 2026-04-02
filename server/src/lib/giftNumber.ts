/**
 * 活动赠送 gift_number：短格式 G + yymmdd + 4 位字母数字；插入 activity_gifts 时若为空则自动生成。
 */
import { queryOne } from '../database/index.js';

const ALPHANUM = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function randomAlphaNumSuffix(len: number): string {
  let s = '';
  for (let i = 0; i < len; i++) {
    s += ALPHANUM[Math.floor(Math.random() * ALPHANUM.length)];
  }
  return s;
}

export function buildShortGiftNumberCandidate(): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `G${yy}${mm}${dd}${randomAlphaNumSuffix(4)}`;
}

export async function generateUniqueActivityGiftNumber(): Promise<string> {
  for (let attempt = 0; attempt < 16; attempt++) {
    const candidate = buildShortGiftNumberCandidate();
    const row = await queryOne<{ id: string }>(
      'SELECT id FROM activity_gifts WHERE gift_number = ? LIMIT 1',
      [candidate]
    );
    if (!row) return candidate;
  }
  return `G${Date.now().toString(36).toUpperCase()}${randomAlphaNumSuffix(2)}`;
}
