/**
 * 抽奖假人：昵称解析、生成 100 人池、对外展示脱敏（仅服务端）
 */
import { randomInt, randomUUID } from 'node:crypto';

/**
 * MySQL JSON 列经 mysql2 可能已是数组/对象；对数组再 JSON.parse 会抛错。
 * 统一转成数组供 pool_json 读取。
 */
export function coerceMysqlJsonToArray(raw: unknown): unknown[] | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const v = JSON.parse(raw) as unknown;
      return Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
    try {
      const v = JSON.parse(raw.toString('utf8')) as unknown;
      return Array.isArray(v) ? v : null;
    } catch {
      return null;
    }
  }
  return null;
}

export interface SpinFakeUserJson {
  id: string;
  name: string;
  is_fake: true;
}

/** 会员端滚动条等对外展示：首字符 + ****（需求指定实现） */
export function maskSpinSimDisplayName(name: string): string {
  if (!name) return '';
  return name.charAt(0) + '****';
}

/** 按换行 / 英文逗号 / 中文逗号分割，trim，去空 */
export function parseNicknameLines(raw: string): string[] {
  if (raw == null || !String(raw).trim()) return [];
  return String(raw)
    .split(/[\n,，]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * ≥100：随机取 100；<100：循环补满 100。
 * id 形如 fake_<uuid>，保证唯一。
 */
export function buildSpinFakeUserPoolFromNames(names: string[]): SpinFakeUserJson[] {
  const cleaned = [...names];
  if (cleaned.length === 0) return [];

  let picked: string[] = [];
  if (cleaned.length >= 100) {
    const idxs = Array.from({ length: cleaned.length }, (_, i) => i);
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = randomInt(0, i + 1);
      [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
    }
    picked = idxs.slice(0, 100).map((i) => cleaned[i]!);
  } else {
    picked = Array.from({ length: 100 }, (_, i) => cleaned[i % cleaned.length]!);
  }

  return picked.map((name) => ({
    id: `fake_${randomUUID().replace(/-/g, '')}`,
    name,
    is_fake: true as const,
  }));
}
