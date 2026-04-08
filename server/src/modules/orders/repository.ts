/**
 * Orders Repository - 唯一可操作 orders 表的层
 * 使用 MySQL (mysql2/promise) 替代 Supabase
 */
import { randomUUID } from 'node:crypto';
import { query, queryOne, execute } from '../../database/index.js';
import { ensureOrderNumberForInsert } from './orderNumber.js';

export type MeikaZoneKind = 'fiat' | 'usdt';

export async function listOrdersRepository(tenantId?: string | null, limit = 50) {
  if (!tenantId) return [];
  return query(
    `SELECT * FROM orders WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?`,
    [tenantId, limit]
  );
}

/** 直接查询订单（JWT 认证时使用）。tenantId 必须有值；无值时返回空数组防止跨租户泄漏。
 *  LEFT JOIN members 表补全缺失的 phone_number / member_code */
async function getOrdersFullByTenantRepository(tenantId: string | undefined, excludeUsdt: boolean): Promise<any[]> {
  if (!tenantId) return [];
  const conditions: string[] = ['(o.is_deleted IS NULL OR o.is_deleted = false)'];
  const params: any[] = [];

  if (excludeUsdt) {
    conditions.push(`(o.currency IS NULL OR o.currency != 'USDT')`);
  } else {
    conditions.push(`o.currency = 'USDT'`);
  }

  conditions.push(`o.tenant_id = ?`);
  params.push(tenantId);

  const sql = `SELECT o.*,
    COALESCE(o.phone_number, m.phone_number) AS phone_number,
    COALESCE(o.member_code_snapshot, m.member_code) AS member_code_snapshot
    FROM orders o
    LEFT JOIN members m ON o.member_id = m.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY o.created_at DESC`;
  return query(sql, params);
}

/** 平台/租户：非 USDT 订单完整列表。tenantId 为空时返回全部 */
export async function getOrdersFullRepository(_token: string, tenantId?: string): Promise<any[]> {
  return getOrdersFullByTenantRepository(tenantId, true);
}

/** 平台/租户：USDT 订单完整列表。tenantId 为空时返回全部 */
export async function getUsdtOrdersFullRepository(_token: string, tenantId?: string): Promise<any[]> {
  return getOrdersFullByTenantRepository(tenantId, false);
}

/** 美卡专区 · 赛地/奈拉：仅含 meika_zone_order_links.kind=fiat 的订单（与 full 同结构） */
export async function getMeikaFiatOrdersFullRepository(_token: string, tenantId?: string): Promise<any[]> {
  if (!tenantId) return [];
  const conditions: string[] = [
    '(o.is_deleted IS NULL OR o.is_deleted = false)',
    `(o.currency IS NULL OR o.currency != 'USDT')`,
    `mz.kind = 'fiat'`,
    `o.tenant_id = ?`,
  ];
  const params: any[] = [tenantId];
  const sql = `SELECT o.*,
    COALESCE(o.phone_number, m.phone_number) AS phone_number,
    COALESCE(o.member_code_snapshot, m.member_code) AS member_code_snapshot
    FROM orders o
    INNER JOIN meika_zone_order_links mz ON mz.order_id = o.id AND mz.kind = 'fiat'
    LEFT JOIN members m ON o.member_id = m.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY o.created_at DESC`;
  return query(sql, params);
}

/** 美卡专区 · USDT：仅含 meika_zone_order_links.kind=usdt 的订单 */
export async function getMeikaUsdtOrdersFullRepository(_token: string, tenantId?: string): Promise<any[]> {
  if (!tenantId) return [];
  const conditions: string[] = [
    '(o.is_deleted IS NULL OR o.is_deleted = false)',
    `o.currency = 'USDT'`,
    `mz.kind = 'usdt'`,
    `o.tenant_id = ?`,
  ];
  const params: any[] = [tenantId];
  const sql = `SELECT o.*,
    COALESCE(o.phone_number, m.phone_number) AS phone_number,
    COALESCE(o.member_code_snapshot, m.member_code) AS member_code_snapshot
    FROM orders o
    INNER JOIN meika_zone_order_links mz ON mz.order_id = o.id AND mz.kind = 'usdt'
    LEFT JOIN members m ON o.member_id = m.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY o.created_at DESC`;
  return query(sql, params);
}

export async function insertMeikaZoneOrderLinkRepository(params: {
  orderId: string;
  tenantId: string | null | undefined;
  kind: MeikaZoneKind;
}): Promise<void> {
  const id = randomUUID();
  await execute(
    `INSERT INTO meika_zone_order_links (id, tenant_id, order_id, kind, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP(3))`,
    [id, params.tenantId ?? null, params.orderId, params.kind],
  );
}

/** 创建订单 */
export async function createOrderRepository(record: Record<string, unknown>) {
  const id = record.id ?? randomUUID();
  const merged: Record<string, unknown> = { ...record, id };
  await ensureOrderNumberForInsert(merged);

  const keys = Object.keys(merged);
  const placeholders = keys.map(() => '?').join(', ');
  const values = keys.map(k => merged[k]);

  await execute(
    `INSERT INTO orders (${keys.join(', ')}) VALUES (${placeholders})`,
    values
  );

  // 回查插入的行（UUID 主键无法使用 insertId）
  const inserted = await queryOne<Record<string, unknown>>(
    `SELECT * FROM orders WHERE id = ?`,
    [id]
  );
  return inserted;
}

/** 更新订单 points_status, order_points */
export async function updateOrderPointsRepository(orderId: string, updates: { points_status?: string; order_points?: number }, tenantId?: string | null) {
  const setClauses: string[] = [];
  const params: any[] = [];

  if (updates.points_status !== undefined) {
    setClauses.push('points_status = ?');
    params.push(updates.points_status);
  }
  if (updates.order_points !== undefined) {
    setClauses.push('order_points = ?');
    params.push(updates.order_points);
  }

  if (setClauses.length === 0) return null;

  if (tenantId) {
    params.push(orderId, tenantId);
    await execute(
      `UPDATE orders SET ${setClauses.join(', ')} WHERE id = ? AND tenant_id = ?`,
      params
    );
  } else {
    params.push(orderId);
    await execute(
      `UPDATE orders SET ${setClauses.join(', ')} WHERE id = ?`,
      params
    );
  }

  return queryOne(`SELECT * FROM orders WHERE id = ?`, [orderId]);
}
