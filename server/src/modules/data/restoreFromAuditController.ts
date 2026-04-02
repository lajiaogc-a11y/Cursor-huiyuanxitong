/**
 * 操作日志审计恢复 — POST /api/data/restore/*
 * 将 beforeData 写回对应表（与前端 operationLogRestoreService 对齐）
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { execute, queryOne } from '../../database/index.js';
import { generateUniqueActivityGiftNumber } from '../../lib/giftNumber.js';

type RestoreBody = {
  logId?: string;
  objectId?: string | null;
  beforeData?: unknown;
};

function requireRestoreAdmin(req: AuthenticatedRequest, res: Response): boolean {
  if (req.user?.type === 'member' || !req.user) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } });
    return false;
  }
  const ok =
    req.user.is_platform_super_admin ||
    req.user.is_super_admin ||
    req.user.role === 'admin';
  if (!ok) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin only' } });
    return false;
  }
  return true;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function camelToSnakeKey(key: string): string {
  if (key.includes('_')) return key;
  return key
    .replace(/([A-Z])/g, '_$1')
    .toLowerCase()
    .replace(/^_/, '');
}

function normalizeKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[camelToSnakeKey(k)] = v;
  }
  return out;
}

function pickAllowed(
  row: Record<string, unknown>,
  allowed: Set<string>,
  jsonCols: Set<string>
): { cols: string[]; vals: unknown[] } {
  const cols: string[] = [];
  const vals: unknown[] = [];
  for (const [k, v] of Object.entries(row)) {
    if (!allowed.has(k) || v === undefined) continue;
    cols.push(k);
    if (v === null) {
      vals.push(null);
    } else if (jsonCols.has(k)) {
      vals.push(typeof v === 'string' ? v : JSON.stringify(v));
    } else if (typeof v === 'boolean') {
      vals.push(v ? 1 : 0);
    } else {
      vals.push(v);
    }
  }
  return { cols, vals };
}

async function assertOrderTenant(req: AuthenticatedRequest, orderId: string, res: Response): Promise<boolean> {
  const row = await queryOne<{ tenant_id: string | null }>(
    `SELECT tenant_id FROM orders WHERE id = ? LIMIT 1`,
    [orderId],
  );
  if (!row) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Order not found' } });
    return false;
  }
  if (req.user?.is_platform_super_admin) return true;
  const tid = req.user?.tenant_id ?? null;
  if (row.tenant_id && tid && row.tenant_id !== tid) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant mismatch' } });
    return false;
  }
  return true;
}

function looksLikeUuid(s: unknown): boolean {
  if (typeof s !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

/** beforeData 经 normalizeKeys 后为 snake_case（与前端 Order / UsdtOrder 审计快照一致） */
function buildOrderPatch(b: Record<string, unknown>): Record<string, unknown> {
  const isUsdt = b.currency === 'USDT' || b.demand_currency === 'USDT' || b.usdt_rate != null;
  const num = (v: unknown): number | null => {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const str = (v: unknown): string | null => (v == null || v === '' ? null : String(v));

  const patch: Record<string, unknown> = {};

  if (b.order_number != null) patch.order_number = str(b.order_number);
  else if (b.id != null && !looksLikeUuid(b.id)) patch.order_number = str(b.id);

  if (b.order_type != null) patch.order_type = str(b.order_type);

  if (b.card_value != null) {
    const x = num(b.card_value);
    if (x != null) patch.card_value = x;
  }

  const ex = b.exchange_rate ?? b.card_rate ?? b.rate;
  if (ex != null) {
    const er = num(ex);
    if (er != null) {
      patch.exchange_rate = er;
      patch.rate = er;
    }
  }

  const fr = b.foreign_rate ?? b.usdt_rate;
  if (fr != null) {
    const x = num(fr);
    if (x != null) patch.foreign_rate = x;
  }

  const amt = b.amount ?? b.card_worth;
  if (amt != null) {
    const x = num(amt);
    if (x != null) patch.amount = x;
  }

  const ap = b.actual_payment ?? b.actual_paid_usdt ?? b.actual_paid;
  if (ap != null) {
    const x = num(ap);
    if (x != null) patch.actual_payment = x;
  }

  const fee = b.fee ?? b.fee_usdt;
  if (fee != null) {
    const x = num(fee);
    if (x != null) patch.fee = x;
  }

  if (b.payment_value != null) {
    const x = num(b.payment_value);
    if (x != null) patch.payment_value = x;
  }

  const vend = b.card_merchant_id ?? b.vendor;
  if (vend != null) {
    const v = str(vend);
    patch.card_merchant_id = v;
    patch.vendor_id = v;
  }

  if (b.payment_provider != null) patch.payment_provider = str(b.payment_provider);

  if (isUsdt) {
    const pr = b.profit_usdt ?? b.profit;
    if (pr != null) {
      const x = num(pr);
      if (x != null) patch.profit_usdt = x;
    }
    patch.profit_ngn = null;
  } else {
    const pr = b.profit_ngn ?? b.profit;
    if (pr != null) {
      const x = num(pr);
      if (x != null) patch.profit_ngn = x;
    }
  }

  if (b.profit_rate != null) {
    const x = num(b.profit_rate);
    if (x != null) patch.profit_rate = x;
  }

  if (b.phone_number != null) patch.phone_number = str(b.phone_number);
  if (b.member_code_snapshot != null || b.member_code != null) {
    patch.member_code_snapshot = str(b.member_code_snapshot ?? b.member_code);
  }

  const cur = b.currency ?? b.demand_currency;
  if (cur != null) patch.currency = str(cur);

  if (b.remark != null) patch.remark = str(b.remark);
  if (b.status != null) patch.status = str(b.status);
  if (b.order_points != null) {
    const x = num(b.order_points);
    if (x != null) patch.order_points = x;
  }
  if (b.points_status != null) patch.points_status = str(b.points_status);
  if (b.created_at != null && typeof b.created_at === 'string') patch.created_at = b.created_at;

  return patch;
}

async function resolveMemberIdByPhone(phone: string): Promise<string | null> {
  const p = String(phone || '').trim();
  if (!p) return null;
  const row = await queryOne<{ id: string }>(`SELECT id FROM members WHERE phone_number = ? LIMIT 1`, [p]);
  return row?.id ?? null;
}

export async function restoreOrderFromAuditController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireRestoreAdmin(req, res)) return;
  const body = req.body as RestoreBody;
  const objectId = body.objectId != null ? String(body.objectId) : '';
  const before = asRecord(body.beforeData);
  if (!objectId || !before) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'objectId and beforeData required' } });
    return;
  }
  if (!(await assertOrderTenant(req, objectId, res))) return;

  const normalized = normalizeKeys(before);
  const patch = buildOrderPatch(normalized);
  delete patch.id;

  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No fields to restore' } });
    return;
  }
  const setCl = entries.map(([k]) => `\`${k}\` = ?`).join(', ');
  const vals = entries.map(([, v]) => v);
  await execute(`UPDATE orders SET ${setCl} WHERE id = ?`, [...vals, objectId]);
  res.json({ success: true, data: { ok: true } });
}

async function assertActivityGiftTenantRow(
  req: AuthenticatedRequest,
  rowTenantId: string | null | undefined,
  res: Response,
): Promise<boolean> {
  if (req.user?.is_platform_super_admin) return true;
  const tid = req.user?.tenant_id ?? null;
  if (rowTenantId && tid && rowTenantId !== tid) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Tenant mismatch' } });
    return false;
  }
  return true;
}

/** 与 deleteActivityGiftRepository 中扣减 total_gift_* 对称：恢复赠送行后把金额加回 member_activity */
async function incrementMemberActivityTotalsAfterGiftRestore(row: Record<string, unknown>): Promise<void> {
  const amount = Number(row.amount) || 0;
  const phone = row.phone_number != null ? String(row.phone_number).trim() : '';
  if (amount <= 0 || !phone) return;
  const currency = String(row.currency || 'NGN');
  let giftField = 'total_gift_ngn';
  if (currency === 'GHS' || currency === '赛地') giftField = 'total_gift_ghs';
  else if (currency === 'USDT') giftField = 'total_gift_usdt';
  const midRaw = row.member_id;
  const mid = midRaw != null && String(midRaw).trim() !== '' ? String(midRaw).trim() : null;
  const act = mid
    ? await queryOne<{ id: string }>(`SELECT id FROM member_activity WHERE member_id = ? LIMIT 1`, [mid])
    : await queryOne<{ id: string }>(`SELECT id FROM member_activity WHERE phone_number = ? LIMIT 1`, [phone]);
  if (act) {
    await execute(
      `UPDATE member_activity SET ${giftField} = COALESCE(${giftField}, 0) + ?, updated_at = NOW(3) WHERE id = ?`,
      [amount, act.id],
    );
  }
}

function isMysqlDuplicateKeyError(e: unknown): boolean {
  const err = e as NodeJS.ErrnoException & { code?: string };
  return err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062;
}

function formatValueForActivityGiftSql(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (v instanceof Date) {
    const s = v.toISOString();
    return s.length >= 23 ? s.slice(0, 23).replace('T', ' ') : s.replace('T', ' ').slice(0, 23);
  }
  if (typeof v === 'object' && !Array.isArray(v)) {
    const tag = Object.prototype.toString.call(v);
    if (tag === '[object Date]' && typeof (v as Date).toISOString === 'function') {
      const s = (v as Date).toISOString();
      return s.length >= 23 ? s.slice(0, 23).replace('T', ' ') : s.replace('T', ' ').slice(0, 23);
    }
    return JSON.stringify(v);
  }
  return v;
}

function coerceActivityGiftRowScalars(row: Record<string, unknown>): void {
  for (const k of ['amount', 'rate', 'fee', 'gift_value'] as const) {
    if (row[k] !== undefined && row[k] !== null) {
      const x = Number(row[k]);
      if (!Number.isNaN(x)) row[k] = x;
    }
  }
  if (row.phone_number != null) row.phone_number = String(row.phone_number).trim();
  if (row.payment_agent != null) row.payment_agent = String(row.payment_agent).trim();
  if (row.currency != null) row.currency = String(row.currency);
  if (row.gift_type != null) row.gift_type = String(row.gift_type);
  if (row.remark != null) row.remark = String(row.remark);
  if (row.status != null) row.status = String(row.status);
  if (row.created_at != null && typeof row.created_at === 'string') {
    const s = row.created_at.trim();
    if (s.includes('T') && !s.includes(' ')) {
      row.created_at = s.length >= 23 ? s.slice(0, 23).replace('T', ' ') : s.replace('T', ' ');
    }
  }
}

export async function restoreActivityGiftFromAuditController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireRestoreAdmin(req, res)) return;
  try {
    const body = req.body as RestoreBody;
    const objectId = body.objectId != null ? String(body.objectId) : '';
    const before = asRecord(body.beforeData);
    if (!objectId || !before) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'objectId and beforeData required' } });
      return;
    }

    const n = normalizeKeys(before);
    const existing = await queryOne<{ tenant_id: string | null }>(
      `SELECT tenant_id FROM activity_gifts WHERE id = ? LIMIT 1`,
      [objectId],
    );

    if (existing) {
      if (!(await assertActivityGiftTenantRow(req, existing.tenant_id, res))) return;
    } else {
      const beforeTid = n.tenant_id != null ? String(n.tenant_id) : null;
      if (!(await assertActivityGiftTenantRow(req, beforeTid, res))) return;
    }

    const row: Record<string, unknown> = {};
    const copyKeys = [
      'gift_number',
      'currency',
      'amount',
      'rate',
      'phone_number',
      'payment_agent',
      'gift_type',
      'fee',
      'gift_value',
      'remark',
      'creator_id',
      'member_id',
      'tenant_id',
      'status',
      'created_at',
    ] as const;
    for (const k of copyKeys) {
      if (n[k] !== undefined) row[k] = n[k];
    }
    coerceActivityGiftRowScalars(row);

    if (!existing) {
      row.id = objectId;
      if (row.tenant_id == null && req.user?.tenant_id) row.tenant_id = req.user.tenant_id;
      const gn = row.gift_number;
      if (gn == null || (typeof gn === 'string' && gn.trim() === '')) {
        row.gift_number = await generateUniqueActivityGiftNumber();
      } else {
        const gns = String(gn).trim();
        const clash = await queryOne<{ id: string }>(
          `SELECT id FROM activity_gifts WHERE gift_number = ? LIMIT 1`,
          [gns],
        );
        if (clash) {
          row.gift_number = await generateUniqueActivityGiftNumber();
        }
      }
      const required = ['currency', 'amount', 'rate', 'phone_number', 'payment_agent'] as const;
      for (const k of required) {
        if (row[k] == null || row[k] === '') {
          res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: `Missing ${k} for gift restore` } });
          return;
        }
      }
      const cols = Object.keys(row).filter((c) => row[c] !== undefined);
      const placeholders = cols.map(() => '?').join(', ');
      const vals = cols.map((c) => formatValueForActivityGiftSql(row[c]));
      try {
        await execute(
          `INSERT INTO activity_gifts (${cols.map((c) => `\`${c}\``).join(', ')}) VALUES (${placeholders})`,
          vals,
        );
      } catch (insertErr) {
        if (isMysqlDuplicateKeyError(insertErr)) {
          row.gift_number = await generateUniqueActivityGiftNumber();
          const cols2 = Object.keys(row).filter((c) => row[c] !== undefined);
          const ph2 = cols2.map(() => '?').join(', ');
          const vals2 = cols2.map((c) => formatValueForActivityGiftSql(row[c]));
          await execute(
            `INSERT INTO activity_gifts (${cols2.map((c) => `\`${c}\``).join(', ')}) VALUES (${ph2})`,
            vals2,
          );
        } else {
          throw insertErr;
        }
      }
      await incrementMemberActivityTotalsAfterGiftRestore(row);
    } else {
      delete row.tenant_id;
      const cols = Object.keys(row).filter((c) => row[c] !== undefined);
      if (cols.length === 0) {
        res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No fields to restore' } });
        return;
      }
      const setCl = cols.map((c) => `\`${c}\` = ?`).join(', ');
      const vals = cols.map((c) => formatValueForActivityGiftSql(row[c]));
      await execute(`UPDATE activity_gifts SET ${setCl} WHERE id = ?`, [...vals, objectId]);
    }

    res.json({ success: true, data: { ok: true } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[restoreActivityGiftFromAudit]', e);
    res.status(500).json({
      success: false,
      error: { code: 'RESTORE_FAILED', message: msg || 'Activity gift restore failed' },
    });
  }
}

const CARD_COLS = new Set([
  'name',
  'type',
  'status',
  'remark',
  'card_vendors',
  'sort_order',
]);
const VENDOR_COLS = new Set(['name', 'status', 'remark', 'payment_providers', 'sort_order']);
const PROVIDER_COLS = new Set(['name', 'status', 'remark', 'sort_order']);
const ACTIVITY_TYPE_COLS = new Set(['name', 'code', 'description', 'is_active']);
const CURRENCY_COLS = new Set(['code', 'name_zh', 'name_en', 'symbol', 'badge_color', 'sort_order', 'is_active']);
const CUSTOMER_SOURCE_COLS = new Set(['name', 'sort_order', 'is_active']);

async function restoreSimpleTable(
  req: AuthenticatedRequest,
  res: Response,
  table: string,
  allowed: Set<string>,
  jsonCols: Set<string>,
  id: string,
  before: Record<string, unknown>,
): Promise<void> {
  const n = normalizeKeys(before);
  const { cols, vals } = pickAllowed(n, allowed, jsonCols);
  const filtered = cols.filter((c) => c !== 'id');
  const fvals = filtered.map((c) => vals[cols.indexOf(c)]);

  if (filtered.length === 0) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No fields to restore' } });
    return;
  }

  const existing = await queryOne<{ id: string }>(`SELECT id FROM \`${table}\` WHERE id = ? LIMIT 1`, [id]);
  if (existing) {
    const setCl = filtered.map((c) => `\`${c}\` = ?`).join(', ');
    await execute(`UPDATE \`${table}\` SET ${setCl} WHERE id = ?`, [...fvals, id]);
  } else {
    const insertCols: string[] = ['id', ...filtered];
    const insertVals: unknown[] = [id, ...fvals];
    if (table === 'gift_cards') {
      if (!insertCols.includes('card_number')) {
        insertCols.push('card_number');
        insertVals.push(`RESTORE-${id.replace(/-/g, '').slice(0, 12)}`);
      }
      if (!insertCols.includes('currency')) {
        insertCols.push('currency');
        insertVals.push('CNY');
      }
      if (!insertCols.includes('denomination')) {
        insertCols.push('denomination');
        insertVals.push(0);
      }
      if (!insertCols.includes('status')) {
        insertCols.push('status');
        insertVals.push('active');
      }
    }
    const ph = insertCols.map(() => '?').join(', ');
    const colQ = insertCols.map((c) => `\`${c}\``).join(', ');
    await execute(`INSERT INTO \`${table}\` (${colQ}) VALUES (${ph})`, insertVals);
  }
  res.json({ success: true, data: { ok: true } });
}

export async function restoreCardFromAuditController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireRestoreAdmin(req, res)) return;
  const body = req.body as RestoreBody;
  const objectId = body.objectId != null ? String(body.objectId) : '';
  const before = asRecord(body.beforeData);
  if (!objectId || !before) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'objectId and beforeData required' } });
    return;
  }
  await restoreSimpleTable(req, res, 'gift_cards', CARD_COLS, new Set(['card_vendors']), objectId, before);
}

export async function restoreVendorFromAuditController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireRestoreAdmin(req, res)) return;
  const body = req.body as RestoreBody;
  const objectId = body.objectId != null ? String(body.objectId) : '';
  const before = asRecord(body.beforeData);
  if (!objectId || !before) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'objectId and beforeData required' } });
    return;
  }
  await restoreSimpleTable(req, res, 'vendors', VENDOR_COLS, new Set(['payment_providers']), objectId, before);
}

export async function restorePaymentProviderFromAuditController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireRestoreAdmin(req, res)) return;
  const body = req.body as RestoreBody;
  const objectId = body.objectId != null ? String(body.objectId) : '';
  const before = asRecord(body.beforeData);
  if (!objectId || !before) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'objectId and beforeData required' } });
    return;
  }
  await restoreSimpleTable(req, res, 'payment_providers', PROVIDER_COLS, new Set(), objectId, before);
}

export async function restoreActivityTypeFromAuditController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireRestoreAdmin(req, res)) return;
  const body = req.body as RestoreBody;
  const objectId = body.objectId != null ? String(body.objectId) : '';
  const before = asRecord(body.beforeData);
  if (!objectId || !before) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'objectId and beforeData required' } });
    return;
  }
  await restoreSimpleTable(req, res, 'activity_types', ACTIVITY_TYPE_COLS, new Set(), objectId, before);
}

export async function restoreCurrencyFromAuditController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireRestoreAdmin(req, res)) return;
  const body = req.body as RestoreBody;
  const objectId = body.objectId != null ? String(body.objectId) : '';
  const before = asRecord(body.beforeData);
  if (!objectId || !before) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'objectId and beforeData required' } });
    return;
  }
  await restoreSimpleTable(req, res, 'currencies', CURRENCY_COLS, new Set(), objectId, before);
}

export async function restoreCustomerSourceFromAuditController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireRestoreAdmin(req, res)) return;
  const body = req.body as RestoreBody;
  const objectId = body.objectId != null ? String(body.objectId) : '';
  const before = asRecord(body.beforeData);
  if (!objectId || !before) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'objectId and beforeData required' } });
    return;
  }
  await restoreSimpleTable(req, res, 'customer_sources', CUSTOMER_SOURCE_COLS, new Set(), objectId, before);
}

export async function restoreReferralFromAuditController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireRestoreAdmin(req, res)) return;
  const body = req.body as RestoreBody;
  const objectId = body.objectId != null ? String(body.objectId) : '';
  const before = asRecord(body.beforeData);
  if (!objectId || !before) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'objectId and beforeData required' } });
    return;
  }

  const n = normalizeKeys(before);
  const refPhone = String(n.referrer_phone ?? '').trim();
  const refePhone = String(n.referee_phone ?? '').trim();
  const referrerId = await resolveMemberIdByPhone(refPhone);
  const refereeId = await resolveMemberIdByPhone(refePhone);
  if (!referrerId || !refereeId) {
    res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Cannot resolve referrer or referee member by phone' },
    });
    return;
  }

  const level = n.level != null ? Number(n.level) : 1;
  const lv = Number.isFinite(level) ? level : 1;
  const refCode = n.referrer_member_code != null ? String(n.referrer_member_code) : null;
  const refeCode = n.referee_member_code != null ? String(n.referee_member_code) : null;
  const sourceVal = n.source != null ? String(n.source) : null;
  const createdAt = n.created_at != null && typeof n.created_at === 'string' ? n.created_at : null;

  await execute(
    `INSERT INTO referral_relations (id, referrer_id, referee_id, level, referrer_phone, referrer_member_code, referee_phone, referee_member_code, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW(3)))
     ON DUPLICATE KEY UPDATE referrer_id = VALUES(referrer_id), referee_id = VALUES(referee_id), level = VALUES(level),
       referrer_phone = VALUES(referrer_phone), referrer_member_code = VALUES(referrer_member_code), referee_phone = VALUES(referee_phone),
       referee_member_code = VALUES(referee_member_code), source = VALUES(source)`,
    [objectId, referrerId, refereeId, lv, refPhone || null, refCode, refePhone || null, refeCode, sourceVal, createdAt],
  );
  res.json({ success: true, data: { ok: true } });
}
