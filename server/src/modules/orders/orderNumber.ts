/**
 * 可读业务单号（与前端 hooks/orders/utils：generateOrderNumber / generateUniqueOrderNumber 一致）
 * YYMMDD + 3 字母 + 5 数字 + 时间戳后 4 位；插入前查重 uk_orders_number。
 */
import { randomUUID } from 'node:crypto';
import { execute, query, queryOne } from '../../database/index.js';
import { getShanghaiDateString } from '../../lib/shanghaiTime.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** 标准 UUID（与 id 同形时视为非可读业务单号，需替换） */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function yyMMDD(d: Date): string {
  const ymd = getShanghaiDateString(d);
  const [y, m, day] = ymd.split('-');
  return `${y.slice(-2)}${m}${day}`;
}

export function generateOrderNumber(anchor: Date = new Date()): string {
  const datePart = yyMMDD(anchor);
  const letterPart = Array.from({ length: 3 }, () => LETTERS[Math.floor(Math.random() * 26)]).join('');
  const numberPart = Array.from({ length: 5 }, () => Math.floor(Math.random() * 10)).join('');
  return `${datePart}${letterPart}${numberPart}`;
}

async function isOrderNumberTaken(candidate: string): Promise<boolean> {
  const row = await queryOne<{ c: number }>(
    'SELECT COUNT(*) AS c FROM orders WHERE order_number = ? LIMIT 1',
    [candidate],
  );
  return (row?.c ?? 0) > 0;
}

/** 与前端 generateUniqueOrderNumber 一致：基础段 + Date.now() 后四位，并查库去重 */
export async function generateUniqueOrderNumber(maxRetries = 12): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const candidate = `${generateOrderNumber()}${Date.now().toString().slice(-4)}`;
    if (!(await isOrderNumberTaken(candidate))) return candidate;
  }
  const fallback = `${generateOrderNumber()}${Date.now().toString().slice(-4)}${randomUUID().replace(/-/g, '').slice(0, 6)}`;
  if (!(await isOrderNumberTaken(fallback))) return fallback;
  return `${generateOrderNumber()}${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

/** 回填历史行：按订单 created_at 的日历生成前缀，避免「今天批量补号」全部落在当日 */
export async function generateUniqueOrderNumberForCreatedAt(createdAt: Date, maxRetries = 12): Promise<string> {
  const anchor = createdAt instanceof Date && !Number.isNaN(createdAt.getTime()) ? createdAt : new Date();
  for (let i = 0; i < maxRetries; i++) {
    const candidate = `${generateOrderNumber(anchor)}${Date.now().toString().slice(-4)}${randomUUID().replace(/-/g, '').slice(0, 4)}`;
    if (!(await isOrderNumberTaken(candidate))) return candidate;
  }
  return generateUniqueOrderNumber();
}

function isBlank(s: unknown): boolean {
  return s == null || (typeof s === 'string' && s.trim() === '');
}

function looksLikeUuid(s: string): boolean {
  return UUID_RE.test(s.trim());
}

/**
 * INSERT 前保证 order_number 为人类可读业务号：空、与 id 相同、或整段为 UUID 时自动生成。
 */
export async function ensureOrderNumberForInsert(row: Record<string, unknown>): Promise<void> {
  const id = String(row.id ?? '').trim();
  const raw = row.order_number;
  const on = typeof raw === 'string' ? raw.trim() : raw != null ? String(raw).trim() : '';

  if (isBlank(on) || on === id || looksLikeUuid(on)) {
    row.order_number = await generateUniqueOrderNumber();
  }
}

/**
 * 迁移：补全历史订单的可读单号（幂等，仅更新仍为空/UUID/与 id 重复的列）
 */
export async function backfillReadableOrderNumbers(): Promise<number> {
  const rows = await query<{ id: string; order_number: string | null; created_at: Date | string }>(
    `SELECT id, order_number, created_at FROM orders WHERE
      order_number IS NULL
      OR TRIM(order_number) = ''
      OR order_number = id
      OR order_number REGEXP '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'`,
  );
  let n = 0;
  for (const r of rows) {
    const created =
      r.created_at instanceof Date ? r.created_at : new Date(String(r.created_at));
    const next = await generateUniqueOrderNumberForCreatedAt(created);
    await execute(`UPDATE orders SET order_number = ? WHERE id = ?`, [next, r.id]);
    n += 1;
  }
  if (n > 0) {
    console.log(`[orders] backfilled ${n} readable order_number(s)`);
  }
  return n;
}
