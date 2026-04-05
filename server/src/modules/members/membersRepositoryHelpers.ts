/**
 * Members repository — shared helpers (password generation, bank_card JSON)
 */
export function generateRandomPassword(length = 8): string {
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
export function bankCardFromDb(raw: unknown): string | null {
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
export function bankCardToJsonParam(value: string | null | undefined): string | null {
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

export function mapMemberRowBankCard(row: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!row) return row;
  return { ...row, bank_card: bankCardFromDb(row.bank_card) };
}

export function isDuplicateKeyError(e: unknown): boolean {
  const err = e as { code?: string; errno?: number };
  return err?.code === 'ER_DUP_ENTRY' || err?.code === '23505' || err?.errno === 1062;
}
