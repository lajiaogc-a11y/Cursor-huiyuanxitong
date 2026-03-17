/**
 * Orders Repository - 唯一可操作 orders 表的层
 * 支持 JWT 认证：使用 supabaseAdmin + tenant_id 查询（替代 Supabase Auth RPC）
 */
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../database/index.js';
import { config } from '../../config/index.js';

export async function listOrdersRepository(tenantId?: string | null, limit = 50) {
  const { getPgPool, queryPg } = await import('../../database/pg.js');
  if (getPgPool()) {
    if (tenantId) {
      return queryPg(
        `SELECT * FROM orders WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
        [tenantId, limit]
      );
    }
    return queryPg(
      `SELECT * FROM orders ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
  }
  let q = supabaseAdmin
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

/** 使用 Supabase token 调用 RPC（兼容旧 Supabase Auth） */
function createUserClient(token: string) {
  return createClient(config.supabase.url, config.supabase.anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/** 直接查询订单（JWT 认证时使用）。tenantId 有值时按租户过滤，无值时返回全部 */
async function getOrdersFullByTenantRepository(tenantId: string | undefined, excludeUsdt: boolean): Promise<any[]> {
  const { getPgPool, queryPg } = await import('../../database/pg.js');
  if (getPgPool()) {
    const currencyCond = excludeUsdt
      ? `(currency IS NULL OR currency != 'USDT')`
      : `currency = 'USDT'`;
    const tenantCond = tenantId ? ` AND tenant_id = $1` : '';
    const rows = await queryPg(
      `SELECT * FROM orders WHERE (is_deleted IS NULL OR is_deleted = false) AND ${currencyCond}${tenantCond} ORDER BY created_at DESC`,
      tenantId ? [tenantId] : []
    );
    return rows;
  }
  let q = supabaseAdmin
    .from('orders')
    .select('*')
    .or('is_deleted.is.null,is_deleted.eq.false')
    .order('created_at', { ascending: false });
  if (tenantId) q = q.eq('tenant_id', tenantId);
  if (excludeUsdt) {
    q = q.or('currency.is.null,currency.neq.USDT');
  } else {
    q = q.eq('currency', 'USDT');
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as any[];
}

/** 平台/租户：非 USDT 订单完整列表。token 为 JWT(eyJ 开头)时用 tenantId 查；tenantId 为空时返回全部 */
export async function getOrdersFullRepository(token: string, tenantId?: string): Promise<any[]> {
  const isJwt = token?.startsWith('eyJ');
  if (isJwt) {
    return getOrdersFullByTenantRepository(tenantId, true);
  }
  const supabase = createUserClient(token);
  if (tenantId) {
    const { data, error } = await (supabase.rpc as any)('platform_get_tenant_orders_full', { p_tenant_id: tenantId });
    if (error) throw error;
    return data ?? [];
  }
  const { data, error } = await (supabase.rpc as any)('get_my_tenant_orders_full', {});
  if (error) throw error;
  return data ?? [];
}

/** 平台/租户：USDT 订单完整列表。token 为 JWT 时 tenantId 为空返回全部 */
export async function getUsdtOrdersFullRepository(token: string, tenantId?: string): Promise<any[]> {
  const isJwt = token?.startsWith('eyJ');
  if (isJwt) {
    return getOrdersFullByTenantRepository(tenantId, false);
  }
  const supabase = createUserClient(token);
  if (tenantId) {
    const { data, error } = await (supabase.rpc as any)('platform_get_tenant_usdt_orders_full', { p_tenant_id: tenantId });
    if (error) throw error;
    return data ?? [];
  }
  const { data, error } = await (supabase.rpc as any)('get_my_tenant_usdt_orders_full', {});
  if (error) throw error;
  return data ?? [];
}

/** 创建订单（导入用） */
export async function createOrderRepository(record: Record<string, unknown>) {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .insert(record)
    .select('id, phone_number, currency, actual_payment')
    .single();
  if (error) throw error;
  return data;
}

/** 更新订单 points_status, order_points */
export async function updateOrderPointsRepository(orderId: string, updates: { points_status?: string; order_points?: number }) {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .update(updates)
    .eq('id', orderId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
