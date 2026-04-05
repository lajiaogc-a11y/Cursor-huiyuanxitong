/**
 * 通用表/RPC 代理控制器
 * 前端 Supabase 代理层（client.ts）将 supabase.from('table') / supabase.rpc('fn') 转发到这里
 * 后端统一用 MySQL 查询处理
 *
 * Table configuration and utility functions are in tableConfig.ts
 */
import type { Request, Response } from 'express';
import type { ResultSetHeader } from 'mysql2';
import { query, queryOne, execute, getPool, withTransaction } from '../../database/index.js';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import {
  type TableTier,
  getTableTier, isTableProxyAllowed, rejectTableAccess, isAdminUser,
  blockMemberTableProxy, blockPlatformSuperStaffInvitationCodes, assertRpcEmployee, effectiveMemberIdForRpc,
  mergeEmployeeAccessScope, TENANT_SCOPED_TABLES,
  mapColumnName, getReverseAliasMap, mapBodyColumns, COLUMN_ALIAS_MAP,
  toMySqlDatetime, parseFilters, parseOrder, SAFE_COLUMN_RE,
} from './tableConfig.js';

// Re-export for backwards compatibility with modules that import from tableProxy
export { isTableProxyAllowed } from './tableConfig.js';
import { applyPointsLedgerDeltaOnConn } from '../points/pointsLedgerAccount.js';
import { addPoints, syncPointsLog } from '../points/pointsService.js';
import { insertOperationLogRepository } from './repository.js';
import { generateUniqueActivityGiftNumber } from '../../lib/giftNumber.js';
import { ensureOrderNumberForInsert } from '../orders/orderNumber.js';
import { draw, getQuota } from '../lottery/service.js';
import { grantOrderCompletedSpinCredits } from '../lottery/repository.js';
import { incrementLotterySpinBalanceConn } from '../lottery/spinBalanceAccount.js';
import { notifyMemberOrderCompletedSpinReward } from '../memberInboxNotifications/repository.js';
import { incrementMemberActivityForNewOrder } from '../members/memberActivityTotals.js';
import { reverseActivityDataForOrder } from '../admin/orderReversal.js';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { runWebhookProcessorRpc } from '../webhooks/rpcBridge.js';
import { runTenantMigrationRpc } from './tenantMigrationMysql.js';
import { buildMysqlUserLockName, mysqlGetLock, mysqlReleaseLock } from '../../lib/mysqlUserLock.js';
import { parsePortalCheckInNumbers, rewardBreakdownForConsecutiveDay } from '../../lib/checkInRewards.js';
import { buildMemberCheckInDailySnapshot } from '../checkIns/memberSummary.js';

/**
 * 员工端积分兑币种：与活动赠送/汇率计算器中的「积分兑换: X积分 → 金额 币种」备注提示一致。
 */
function buildStaffPointsRedemptionRemark(
  points: number,
  giftAmount: number,
  giftCurrency: string
): string {
  const pts = Math.round(Number(points));
  const n = Number(giftAmount);
  const cur = String(giftCurrency || '').trim() || '—';
  let amtStr: string;
  if (!Number.isFinite(n)) {
    amtStr = String(giftAmount);
  } else if (cur === 'USDT') {
    amtStr = n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 6 });
  } else {
    amtStr = n.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
  return `Points redemption: ${pts} pts → ${amtStr} ${cur}`;
}

// ============ GET /api/data/table/:table — SELECT ============

export async function tableSelectController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const table = req.params.table;
  const tier = getTableTier(table);
  if (!tier) { rejectTableAccess(res, table, `Table '${table}' not allowed`); return; }
  if (tier === 'admin_only' && !isAdminUser(req)) { rejectTableAccess(res, table, `Table '${table}' requires admin access`); return; }
  if (blockMemberTableProxy(req, res)) return;
  if (blockPlatformSuperStaffInvitationCodes(req, res, table)) return;

  const params = req.query as Record<string, string>;
  let { where, values } = parseFilters(params, table);
  ({ where, values } = mergeEmployeeAccessScope(req, table, where, values));
  const order = parseOrder(params.order, table);
  /** 防止恶意或误配超大 limit 拖垮 DB；不改变常规分页（≤20000）的语义 */
  const rawLim = params.limit ? parseInt(params.limit, 10) : NaN;
  const cappedLim = Number.isFinite(rawLim) && rawLim > 0 ? Math.min(rawLim, 20000) : NaN;
  const rawOff = params.offset ? parseInt(params.offset, 10) : NaN;
  const hasLimit = Number.isFinite(cappedLim);
  const hasOffset = Number.isFinite(rawOff) && rawOff > 0;
  const limit = hasLimit ? 'LIMIT ?' : '';
  const offset = hasOffset ? 'OFFSET ?' : '';
  const paginationVals: number[] = [];
  if (hasLimit) paginationVals.push(cappedLim);
  if (hasOffset) paginationVals.push(rawOff);
  const selectCols = params.select || '*';
  const reverseAlias = getReverseAliasMap(table);

  // 对于 select 中的 Supabase 关联查询语法（如 "*, tenant:tenants(tenant_code)"），简化为 *
  const safeCols = selectCols.includes('(') ? '*' : selectCols.split(',').map(c => {
    const col = c.trim();
    if (col === '*') return '*';
    // 处理别名：col_name:alias → col_name AS alias
    if (col.includes(':')) {
      const [alias, real] = col.split(':');
      const aliasName = alias.trim();
      const realName = real.trim();
      // 验证列名合法性，防止注入
      if (!SAFE_COLUMN_RE.test(aliasName) || !SAFE_COLUMN_RE.test(realName)) return null;
      return `\`${realName}\` AS \`${aliasName}\``;
    }
    // 验证列名合法性，防止注入
    if (!SAFE_COLUMN_RE.test(col)) return null;
    // 应用列名映射：前端列名 → 数据库实际列名，用 AS 保留前端期望的名称
    const dbCol = mapColumnName(table, col);
    if (!SAFE_COLUMN_RE.test(dbCol)) return null;
    if (dbCol !== col) {
      return `\`${dbCol}\` AS \`${col}\``;
    }
    return `\`${col}\``;
  }).filter(Boolean).join(', ') || '*';

  try {
    // 如果需要 count
    if (params.count === 'exact') {
      const countRows = await query<{ total: number }>(`SELECT COUNT(*) as total FROM \`${table}\` ${where}`, values);
      const total = countRows[0]?.total ?? 0;

      if (params.single === 'true' || !limit) {
        const rows = await query(`SELECT ${safeCols} FROM \`${table}\` ${where} ${order} ${limit} ${offset}`, [...values, ...paginationVals]);
        if (params.single === 'true') {
          res.json({ data: rows[0] ?? null, error: null, count: total });
        } else {
          res.json({ data: rows, error: null, count: total });
        }
      } else {
        const rows = await query(`SELECT ${safeCols} FROM \`${table}\` ${where} ${order} ${limit} ${offset}`, [...values, ...paginationVals]);
        res.json({ data: rows, error: null, count: total });
      }
      return;
    }

    let rows = await query(`SELECT ${safeCols} FROM \`${table}\` ${where} ${order} ${limit} ${offset}`, [...values, ...paginationVals]);

    // SELECT * 时，将数据库列名映射回前端期望的列名
    if (selectCols === '*' && reverseAlias) {
      rows = rows.map((row: Record<string, unknown>) => {
        const mapped: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          const frontendCol = reverseAlias[key] ?? key;
          mapped[frontendCol] = value;
          if (frontendCol !== key) mapped[key] = value; // 同时保留原始列名
        }
        return mapped;
      });
    }

    if (params.single === 'true') {
      res.json({ data: rows[0] ?? null, error: null, count: null });
    } else {
      res.json({ data: rows, error: null, count: null });
    }
  } catch (e) {
    console.error(`[TableProxy] SELECT ${table} error:`, e);
    const safeMsg = process.env.NODE_ENV === 'production' ? 'Internal query error' : (e as Error).message;
    res.status(500).json({ data: null, error: { message: safeMsg }, count: null });
  }
}

// ============ POST /api/data/table/:table — INSERT ============

export async function tableInsertController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const table = req.params.table;
  const tier = getTableTier(table);
  if (!tier) { rejectTableAccess(res, table, `Table '${table}' not allowed`); return; }
  if (tier === 'read_only') { rejectTableAccess(res, table, `Table '${table}' is read-only`); return; }
  if (tier === 'audit_workflow') {
    if (req.user?.type !== 'employee' || !req.user.id) {
      rejectTableAccess(res, table, `Table '${table}' requires an employee session`);
      return;
    }
  }
  if (tier === 'admin_only' && !isAdminUser(req)) { rejectTableAccess(res, table, `Table '${table}' requires admin access`); return; }
  if (blockMemberTableProxy(req, res)) return;
  if (blockPlatformSuperStaffInvitationCodes(req, res, table)) return;

  const { data: bodyData, upsert, onConflict } = req.body || {};
  const rows = Array.isArray(bodyData) ? bodyData : [bodyData];

  try {
    const results: unknown[] = [];
    for (let row of rows) {
      if (!row || typeof row !== 'object') continue;

      // 自动生成 UUID 如果没有 id
      if (!row.id) row.id = randomUUID();

      // 应用列名映射（前端列名 → 数据库实际列名）
      row = mapBodyColumns(table, row);

      if (table === 'audit_records') {
        row.status = 'pending';
        if (req.user?.type === 'employee' && req.user.id) {
          row.submitter_id = req.user.id;
        }
        if (req.user?.type === 'employee' && req.user.tenant_id && !req.user.is_platform_super_admin) {
          row.tenant_id = req.user.tenant_id;
        }
      }

      if (table === 'notifications' && req.user?.type === 'employee' && req.user.id) {
        if (!req.user.is_platform_super_admin && !req.user.is_super_admin) {
          row.user_id = req.user.id;
        }
      }
      if (
        table === 'user_data_store' &&
        req.user?.type === 'employee' &&
        !req.user.is_platform_super_admin &&
        req.user.id
      ) {
        row.user_id = req.user.id;
      }
      if (
        table === 'knowledge_read_status' &&
        req.user?.type === 'employee' &&
        !req.user.is_platform_super_admin &&
        req.user.id
      ) {
        row.employee_id = req.user.id;
      }
      if (
        table === 'web_vitals' &&
        req.user?.type === 'employee' &&
        !req.user.is_platform_super_admin &&
        req.user.id
      ) {
        row.employee_id = req.user.id;
      }

      // spins 表 NOT NULL 且无默认时，通用 INSERT 易漏字段
      if (table === 'spins') {
        if (row.spin_type == null || row.spin_type === '') row.spin_type = 'wheel';
        if (row.source == null || row.source === '') row.source = 'member_portal';
        if (row.status == null || row.status === '') row.status = 'issued';
      }

      // 活动赠送：未传 gift_number 时生成短编号（与前端 useActivityGifts 一致）
      if (table === 'activity_gifts') {
        const gn = row.gift_number;
        if (gn == null || (typeof gn === 'string' && gn.trim() === '')) {
          row.gift_number = await generateUniqueActivityGiftNumber();
        }
      }

      // 订单：未传 / 与 id 相同 / UUID 形态时生成可读业务单号（与 hooks/orders/utils 一致）
      if (table === 'orders') {
        await ensureOrderNumberForInsert(row as Record<string, unknown>);
      }

      // 前端 ErrorBoundary / useGlobalErrorReporter：补 NOT NULL 与列映射后的字段
      if (table === 'error_reports') {
        const et = row.error_type;
        if (et == null || (typeof et === 'string' && et.trim() === '')) {
          row.error_type = 'frontend';
        }
        const sev = row.severity;
        if (sev == null || (typeof sev === 'string' && sev.trim() === '')) {
          row.severity = 'error';
        }
      }

      // 旧库 phone_reservations.reserved_by 常为 NOT NULL；通用 INSERT 漏列会报 1364
      if (
        table === 'phone_reservations' &&
        req.user?.type === 'employee' &&
        req.user.id
      ) {
        const rb = row.reserved_by;
        if (rb == null || (typeof rb === 'string' && rb.trim() === '')) {
          row.reserved_by = req.user.id;
        }
      }

      if (table === 'api_keys' && req.user?.type === 'employee' && req.user.id) {
        const cb = row.created_by;
        if (cb == null || (typeof cb === 'string' && cb.trim() === '')) {
          row.created_by = req.user.id;
        }
        const st = row.status;
        if (st == null || (typeof st === 'string' && st.trim() === '')) {
          row.status = 'active';
        }
      }

      if (
        TENANT_SCOPED_TABLES.has(table) &&
        req.user?.type === 'employee' &&
        !req.user.is_platform_super_admin &&
        req.user.tenant_id
      ) {
        row.tenant_id = req.user.tenant_id;
      }

      const cols = Object.keys(row);
      if (cols.length === 0) continue;

      const placeholders = cols.map(() => '?').join(', ');
      const colNames = cols.map(c => `\`${c}\``).join(', ');
      const vals = cols.map(c => {
        const v = row[c];
        if (v === null || v === undefined) return null;
        if (typeof v === 'object') return JSON.stringify(v);
        return toMySqlDatetime(v);
      });

      if (upsert && onConflict) {
        // onConflict 中的列名也需要映射
        const mappedConflictCols = onConflict.split(',').map((c: string) => mapColumnName(table, c.trim()));
        const conflictColSet = new Set(mappedConflictCols);
        const updateCols = cols.filter(c => c !== 'id' && !conflictColSet.has(c));
        const updateStr = updateCols.map(c => `\`${c}\` = VALUES(\`${c}\`)`).join(', ');
        await execute(
          `INSERT INTO \`${table}\` (${colNames}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateStr || 'id=id'}`,
          vals
        );
      } else {
        await execute(`INSERT INTO \`${table}\` (${colNames}) VALUES (${placeholders})`, vals);
      }

      // 回查插入的行
      const inserted = await queryOne(`SELECT * FROM \`${table}\` WHERE id = ?`, [row.id]);
      results.push(inserted);

      if (table === 'orders' && inserted && typeof inserted === 'object') {
        const ins = inserted as Record<string, unknown>;
        const st = String(ins.status ?? '').toLowerCase().trim();
        if (st === 'completed' && ins.id) {
          const memberId = ins.member_id != null ? String(ins.member_id).trim() : '';
          const tenantId = ins.tenant_id != null ? String(ins.tenant_id).trim() : '';
          try {
            await incrementMemberActivityForNewOrder(ins);
          } catch (actErr) {
            console.error('[TableProxy] INSERT orders incrementMemberActivity:', actErr);
          }
          if (memberId && tenantId) {
            try {
              const { granted, amount } = await grantOrderCompletedSpinCredits({
                orderId: String(ins.id),
                memberId,
                tenantId,
              });
              if (granted && amount > 0) {
                await notifyMemberOrderCompletedSpinReward({
                  tenantId,
                  memberId,
                  orderId: String(ins.id),
                  spins: amount,
                });
              }
            } catch (spinErr) {
              console.error('[TableProxy] INSERT orders completed spin:', spinErr);
            }
          }
        }
      }
    }

    res.json({ data: results.length === 1 ? results[0] : results, error: null });
  } catch (e) {
    console.error(`[TableProxy] INSERT ${table} error:`, e);
    res.status(500).json({ data: null, error: { message: (e as Error).message } });
  }
}

// ============ PATCH /api/data/table/:table — UPDATE ============

export async function tableUpdateController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const table = req.params.table;
  const tier = getTableTier(table);
  if (!tier) { rejectTableAccess(res, table, `Table '${table}' not allowed`); return; }
  if (tier === 'read_only') { rejectTableAccess(res, table, `Table '${table}' is read-only`); return; }
  if (tier === 'audit_workflow') {
    if (req.user?.type !== 'employee' || !req.user.id) {
      rejectTableAccess(res, table, `Table '${table}' requires an employee session`);
      return;
    }
  }
  if (tier === 'admin_only' && !isAdminUser(req)) { rejectTableAccess(res, table, `Table '${table}' requires admin access`); return; }
  if (blockMemberTableProxy(req, res)) return;
  if (blockPlatformSuperStaffInvitationCodes(req, res, table)) return;

  const params = req.query as Record<string, string>;
  let { where, values: filterValues } = parseFilters(params, table);
  ({ where, values: filterValues } = mergeEmployeeAccessScope(req, table, where, filterValues));
  const { data: updateData } = req.body || {};

  if (!updateData || typeof updateData !== 'object') {
    res.status(400).json({ data: null, error: { message: 'No update data provided' } });
    return;
  }

  try {
    // 应用列名映射（前端列名 → 数据库实际列名）
    let mappedData = mapBodyColumns(table, updateData) as Record<string, unknown>;
    let auditCasPending = false;
    if (table === 'audit_records') {
      const ALLOWED = new Set(['status', 'reviewer_id', 'review_time', 'review_comment']);
      mappedData = Object.fromEntries(Object.entries(mappedData).filter(([k]) => ALLOWED.has(k)));
      if (Object.keys(mappedData).length === 0) {
        res.status(400).json({ data: null, error: { message: 'No allowed fields to update on audit_records' } });
        return;
      }
      const st = mappedData.status != null ? String(mappedData.status).toLowerCase().trim() : '';
      if (st === 'approved' || st === 'rejected') {
        auditCasPending = true;
      }
      mappedData.reviewer_id = req.user!.id;
    }
    const cols = Object.keys(mappedData);
    const setClauses = cols.map(c => `\`${c}\` = ?`).join(', ');
    const setValues = cols.map(c => {
      const v = mappedData[c];
      if (v === null || v === undefined) return null;
      if (typeof v === 'object') return JSON.stringify(v);
      return toMySqlDatetime(v);
    });

    let whereExec = where;
    if (table === 'audit_records' && auditCasPending) {
      if (!whereExec?.trim()) {
        res.status(400).json({ data: null, error: { message: 'UPDATE audit_records requires a row filter (e.g. id=eq.*)' } });
        return;
      }
      whereExec = `${whereExec} AND \`status\` = 'pending'`;
    }

    let preStatusOrders: { id: string; status: unknown; member_id: unknown; tenant_id: unknown }[] | null = null;
    if (table === 'orders' && mappedData.status !== undefined && whereExec) {
      preStatusOrders = await query(
        `SELECT id, status, member_id, tenant_id FROM \`orders\` ${whereExec}`,
        filterValues,
      );
    }

    const updHeader = await execute(
      `UPDATE \`${table}\` SET ${setClauses} ${whereExec}`,
      [...setValues, ...filterValues],
    );
    if (table === 'audit_records' && auditCasPending && (updHeader.affectedRows ?? 0) === 0) {
      res.status(409).json({
        data: null,
        error: {
          message: 'Record is not pending or was already processed',
          code: 'AUDIT_NOT_PENDING',
        },
      });
      return;
    }

    if (preStatusOrders && preStatusOrders.length > 0) {
      const newStatus = String(mappedData.status ?? '').toLowerCase().trim();
      for (const row of preStatusOrders) {
        const prev = String(row.status ?? '').toLowerCase().trim();
        if (prev === newStatus) continue;
        const memberId = row.member_id != null ? String(row.member_id) : '';
        const tenantId = row.tenant_id != null ? String(row.tenant_id) : '';

        if (newStatus === 'completed' && prev !== 'completed') {
          try {
            const updatedRow = await queryOne<Record<string, unknown>>(
              'SELECT * FROM `orders` WHERE id = ?', [row.id],
            );
            if (updatedRow) await incrementMemberActivityForNewOrder(updatedRow);
          } catch (actErr) {
            console.error('[TableProxy] UPDATE orders incrementMemberActivity:', actErr);
          }
          if (memberId && tenantId) {
            try {
              const { granted, amount } = await grantOrderCompletedSpinCredits({
                orderId: String(row.id),
                memberId: memberId || null,
                tenantId: tenantId || null,
              });
              if (granted && amount > 0) {
                await notifyMemberOrderCompletedSpinReward({ tenantId, memberId, orderId: String(row.id), spins: amount });
              }
            } catch (spinErr) {
              console.error('[TableProxy] order completed spin:', spinErr);
            }
          }
        } else if (prev === 'completed' && newStatus !== 'completed') {
          try {
            await reverseActivityDataForOrder(String(row.id));
          } catch (revErr) {
            console.error('[TableProxy] UPDATE orders reverseActivityData:', revErr);
          }
        }
      }
    }

    // 回查更新后的行
    const rows = await query(`SELECT * FROM \`${table}\` ${whereExec}`, filterValues);
    res.json({ data: rows.length === 1 ? rows[0] : rows, error: null });
  } catch (e) {
    console.error(`[TableProxy] UPDATE ${table} error:`, e);
    res.status(500).json({ data: null, error: { message: (e as Error).message } });
  }
}

// ============ DELETE /api/data/table/:table — DELETE ============

export async function tableDeleteController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const table = req.params.table;
  const tier = getTableTier(table);
  if (!tier) { rejectTableAccess(res, table, `Table '${table}' not allowed`); return; }
  if (tier === 'read_only') { rejectTableAccess(res, table, `Table '${table}' is read-only`); return; }
  if (tier === 'audit_workflow') {
    rejectTableAccess(res, table, `Table '${table}' cannot be deleted via table proxy`);
    return;
  }
  if (tier === 'admin_only' && !isAdminUser(req)) { rejectTableAccess(res, table, `Table '${table}' requires admin access`); return; }
  if (blockMemberTableProxy(req, res)) return;
  if (blockPlatformSuperStaffInvitationCodes(req, res, table)) return;

  const params = req.query as Record<string, string>;
  let { where, values } = parseFilters(params, table);
  ({ where, values } = mergeEmployeeAccessScope(req, table, where, values));

  if (!where) {
    res.status(400).json({ data: null, error: { message: 'DELETE without WHERE is not allowed' } });
    return;
  }

  try {
    const rows = await query(`SELECT * FROM \`${table}\` ${where}`, values);

    if (table === 'orders' && rows.length > 0) {
      const orderIdsToClean: string[] = [];
      for (const row of rows as Record<string, unknown>[]) {
        const st = String(row.status ?? '').toLowerCase().trim();
        if (st === 'completed' && row.id) {
          try { await reverseActivityDataForOrder(String(row.id)); }
          catch (revErr) { console.error('[TableProxy] DELETE orders reverseActivityData:', revErr); }
        }
        if (row.id) orderIdsToClean.push(String(row.id));
      }
      if (orderIdsToClean.length > 0) {
        try {
          await execute(
            `DELETE FROM meika_zone_order_links WHERE order_id IN (${orderIdsToClean.map(() => '?').join(',')})`,
            orderIdsToClean,
          );
        } catch { /* table may not exist yet */ }
      }
    }

    await execute(`DELETE FROM \`${table}\` ${where}`, values);
    res.json({ data: rows, error: null });
  } catch (e) {
    console.error(`[TableProxy] DELETE ${table} error:`, e);
    res.status(500).json({ data: null, error: { message: (e as Error).message } });
  }
}

// ============ POST /api/data/rpc/:fn — RPC 代理 ============

export async function rpcProxyController(req: AuthenticatedRequest, res: Response): Promise<void> {
  /** 专用路由如 POST /rpc/validate_invite_and_submit 无 :fn 参数，需从 path 解析 */
  const pathFn = (req.path || '').match(/\/rpc\/([^/]+)\/?$/)?.[1];
  const fnName = (req.params.fn as string | undefined) ?? pathFn;
  /** 统一小写，避免路由 /member_Spin 等导致未命中 case、落入默认分支 */
  const fn = String(fnName || '').trim().toLowerCase().replace(/-/g, '_');
  const params = req.body || {};
  const userId = req.user?.id;
  // 支持管理员 / 平台超管通过 p_tenant_id 指定租户（查看其他租户数据）
  const isAdmin = req.user?.role === 'admin' || req.user?.is_super_admin;
  const canSelectTenantByParam =
    req.user?.role === 'admin' || req.user?.is_super_admin || req.user?.is_platform_super_admin;
  const tenantId =
    canSelectTenantByParam && params.p_tenant_id ? String(params.p_tenant_id) : req.user?.tenant_id;

  try {
    let result: unknown;

    switch (fn) {
      // ---- 会员相关 RPC ----
      case 'member_check_in':
      case 'member_check_in_today': {
        const memberId = effectiveMemberIdForRpc(req, params);
        /** 与抽奖模块一致：次数来自 spin_credits + daily_free，故签到奖励必须写入 spin_credits */
        const existing = memberId
          ? await queryOne('SELECT id FROM check_ins WHERE member_id = ? AND check_in_date = CURDATE()', [memberId])
          : null;
        if (fn === 'member_check_in_today') {
          let shareCreditsToday = 0;
          let dailyShareCap = 0;
          if (memberId) {
            const shareRow = await queryOne<{ total: number }>(
              `SELECT COALESCE(SUM(amount),0) AS total FROM spin_credits
               WHERE member_id = ? AND source = 'share'
                 AND created_at >= CURDATE()
                 AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)`,
              [memberId],
            );
            shareCreditsToday = Number(shareRow?.total ?? 0);
            const mRow = await queryOne<{ tenant_id: string | null }>('SELECT tenant_id FROM members WHERE id = ?', [memberId]);
            if (mRow?.tenant_id) {
              const sRow = await queryOne<{ daily_share_reward_limit?: number | null }>(
                'SELECT daily_share_reward_limit FROM member_portal_settings WHERE tenant_id = ? LIMIT 1',
                [mRow.tenant_id],
              );
              dailyShareCap = Math.max(0, Number(sRow?.daily_share_reward_limit ?? 0));
            }
          }
          let checkInSnapshot: Awaited<ReturnType<typeof buildMemberCheckInDailySnapshot>> | null = null;
          if (memberId) {
            try {
              checkInSnapshot = await buildMemberCheckInDailySnapshot(memberId);
            } catch {
              checkInSnapshot = null;
            }
          }
          const snap =
            checkInSnapshot || {
              checked_in_today: !!existing,
              current_streak_days: 0,
              reward_base: 1,
              reward_extra_streak_3: 1.5,
              reward_extra_streak_7: 2,
              next_sign_in_streak_day: 1,
              next_reward_base: 1,
              next_reward_extra: 0,
              next_reward_total: 1,
              next_credits: 1,
            };
          const shareCapReached = dailyShareCap > 0 && shareCreditsToday >= dailyShareCap;
          result = {
            checked_in: snap.checked_in_today,
            share_claimed_today: shareCapReached,
            share_credits_today: shareCreditsToday,
            daily_share_cap: dailyShareCap,
            ...snap,
          };
        } else {
          if (!memberId) {
            result = { success: false, error: 'INVALID_PARAMS' };
            break;
          }
          try {
            result = await withTransaction(async (conn) => {
              const [mRows] = await conn.query(
                'SELECT id, tenant_id FROM members WHERE id = ? FOR UPDATE',
                [memberId],
              );
              const mRow = (mRows as { id: string; tenant_id: string | null }[])[0];
              if (!mRow) {
                return { success: false, error: 'MEMBER_NOT_FOUND' };
              }

              const [exRows] = await conn.query(
                'SELECT id FROM check_ins WHERE member_id = ? AND check_in_date = CURDATE() LIMIT 1',
                [memberId],
              );
              if ((exRows as { id: string }[]).length > 0) {
                return { success: false, error: 'ALREADY_CHECKED_IN' };
              }

              const tid = mRow.tenant_id ?? null;
              let enableCheckIn = true;
              type PortalCheckInRow = {
                enable_check_in: number | null;
                checkin_reward_base: number | string | null;
                checkin_reward_streak_3: number | string | null;
                checkin_reward_streak_7: number | string | null;
              };
              let settingsRow: PortalCheckInRow | null = null;
              if (tid) {
                const [sRows] = await conn.query(
                  `SELECT enable_check_in, checkin_reward_base, checkin_reward_streak_3, checkin_reward_streak_7
                   FROM member_portal_settings WHERE tenant_id = ? LIMIT 1`,
                  [tid],
                );
                settingsRow = (sRows as PortalCheckInRow[])[0] ?? null;
                if (settingsRow) {
                  enableCheckIn = settingsRow.enable_check_in !== 0 && settingsRow.enable_check_in != null;
                }
              }
              if (!enableCheckIn) {
                return { success: false, error: 'CHECK_IN_DISABLED' };
              }

              const [yRows] = await conn.query(
                'SELECT streak FROM check_ins WHERE member_id = ? AND check_in_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY) LIMIT 1',
                [memberId],
              );
              const yesterdayRow = (yRows as { streak: number | null }[])[0];
              const consecutive =
                yesterdayRow?.streak != null && !Number.isNaN(Number(yesterdayRow.streak))
                  ? Number(yesterdayRow.streak) + 1
                  : 1;

              const { base, extra3, extra7 } = parsePortalCheckInNumbers(settingsRow);
              const br = rewardBreakdownForConsecutiveDay(consecutive, base, extra3, extra7);
              const rewardValue = br.total;
              const creditAmount = br.credits;

              try {
                await conn.query(
                  'INSERT INTO check_ins (id, member_id, check_in_date, streak, points_awarded) VALUES (UUID(), ?, CURDATE(), ?, ?)',
                  [memberId, consecutive, rewardValue],
                );
              } catch (insE) {
                const msg = String((insE as Error).message || '');
                const errno = (insE as NodeJS.ErrnoException).errno;
                if (errno === 1062) {
                  return { success: false, error: 'ALREADY_CHECKED_IN' };
                }
                if (msg.includes('Unknown column') && (msg.includes('streak') || msg.includes('points_awarded'))) {
                  try {
                    await conn.query(
                      'INSERT INTO check_ins (id, member_id, check_in_date) VALUES (UUID(), ?, CURDATE())',
                      [memberId],
                    );
                  } catch (e2) {
                    if ((e2 as NodeJS.ErrnoException).errno === 1062) {
                      return { success: false, error: 'ALREADY_CHECKED_IN' };
                    }
                    throw e2;
                  }
                } else {
                  throw insE;
                }
              }

              if (creditAmount > 0) {
                await conn.query(
                  'INSERT INTO spin_credits (id, member_id, amount, source, created_at) VALUES (UUID(), ?, ?, ?, NOW())',
                  [memberId, creditAmount, 'check_in'],
                );
                await incrementLotterySpinBalanceConn(conn, memberId, creditAmount, 'check_in');
              }

              return {
                success: true,
                consecutive_days: consecutive,
                reward_type: 'spin',
                reward_base: br.base,
                reward_extra: br.extra,
                reward_value: rewardValue,
                credits_granted: creditAmount,
                checked_in_today: true,
              };
            });
          } catch (e) {
            console.error('[RPC] member_check_in', e);
            result = { success: false, error: 'SAVE_FAILED', message: (e as Error).message };
          }
        }
        break;
      }

      case 'member_get_spins': {
        const memberId = effectiveMemberIdForRpc(req, params);
        const limit = Math.min(parseInt(params.p_limit) || 50, 200);
        /** 与会员转盘页一致：记录来自 lottery_logs */
        const spins = await query(
          `SELECT id, member_id, prize_name AS result, 'lottery' AS source, 'wheel' AS spin_type,
                  'issued' AS status, created_at
           FROM lottery_logs WHERE member_id = ? ORDER BY created_at DESC LIMIT ?`,
          [memberId, limit],
        );
        result = { success: true, spins };
        break;
      }

      case 'upsert_my_member_points_mall_items': {
        if (!assertRpcEmployee(req)) {
          result = { success: false, error: 'EMPLOYEE_ONLY' };
          break;
        }
        /** 与 Supabase 版一致：按租户整表替换，保存后列表与数据库完全一致（可清空后只保留新商品） */
        const items = Array.isArray(params.p_items) ? params.p_items : [];
        if (!tenantId) {
          result = { success: false, error: 'TENANT_NOT_FOUND' };
          break;
        }
        const pool = getPool();
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          await conn.execute('DELETE FROM member_points_mall_items WHERE tenant_id = ?', [tenantId]);
          for (let i = 0; i < items.length; i++) {
            const item = items[i] as Record<string, unknown>;
            const rawId = item.id != null ? String(item.id).trim() : '';
            const id = /^[0-9a-f-]{36}$/i.test(rawId) ? rawId : randomUUID();
            const title = String(item.title ?? '').trim() || 'Product';
            const descriptionRaw = item.description != null ? String(item.description).trim() : '';
            const description = descriptionRaw === '' ? null : descriptionRaw;
            const imageRaw = item.image_url != null ? String(item.image_url).trim() : '';
            const image_url = imageRaw === '' ? null : imageRaw;
            const points_cost = Math.max(0, Number(item.points_cost ?? 0));
            let stock_remaining = Number(item.stock_remaining);
            if (Number.isNaN(stock_remaining) || stock_remaining < 0) stock_remaining = -1;
            else stock_remaining = Math.max(0, stock_remaining);
            const per_order_limit = Math.max(1, Number(item.per_order_limit ?? 1));
            const per_user_daily_limit = Math.max(0, Number(item.per_user_daily_limit ?? 0));
            const per_user_lifetime_limit = Math.max(0, Number(item.per_user_lifetime_limit ?? 0));
            const enabled = item.enabled === false ? 0 : 1;
            const sort_order = i + 1;
            const catRaw = item.mall_category_id != null ? String(item.mall_category_id).trim() : '';
            const mall_category_id = /^[0-9a-f-]{36}$/i.test(catRaw) ? catRaw : null;
            await conn.execute(
              `INSERT INTO member_points_mall_items (id, title, name, description, image_url, points_cost, stock_remaining, per_order_limit, per_user_daily_limit, per_user_lifetime_limit, enabled, sort_order, tenant_id, mall_category_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                id,
                title,
                title,
                description,
                image_url,
                points_cost,
                stock_remaining,
                per_order_limit,
                per_user_daily_limit,
                per_user_lifetime_limit,
                enabled,
                sort_order,
                tenantId,
                mall_category_id,
              ],
            );
          }
          await conn.commit();
          result = { success: true };
        } catch (e) {
          await conn.rollback();
          console.error('[RPC] upsert_my_member_points_mall_items', e);
          result = { success: false, error: 'SAVE_FAILED', message: (e as Error).message };
        } finally {
          conn.release();
        }
        break;
      }

      case 'process_my_member_points_mall_redemption': {
        if (!assertRpcEmployee(req)) {
          result = { success: false, error: 'EMPLOYEE_ONLY' };
          break;
        }
        const mallProcessRole = req.user?.role;
        const canProcessMall =
          mallProcessRole === 'admin' ||
          mallProcessRole === 'manager' ||
          !!req.user?.is_super_admin ||
          !!req.user?.is_platform_super_admin;
        if (!canProcessMall) {
          result = { success: false, error: 'FORBIDDEN_ROLE' };
          break;
        }
        const redemptionId = params.p_redemption_id;
        const action = params.p_action;
        const note = params.p_note || null;
        if (!redemptionId || !['complete', 'reject', 'cancel'].includes(action)) {
          result = { success: false, error: 'INVALID_PARAMS' };
          break;
        }
        if (!tenantId) {
          result = { success: false, error: 'TENANT_NOT_FOUND' };
          break;
        }
        const newStatus = action === 'complete' ? 'completed' : action === 'cancel' ? 'cancelled' : 'rejected';
        const empId = req.user?.type === 'employee' ? String(req.user.id || '').trim() : '';
        const empNameRaw =
          req.user?.type === 'employee'
            ? String(req.user.real_name || req.user.username || '').trim() || null
            : null;
        let processedName = empNameRaw;
        if (empId && !processedName) {
          const er = await queryOne<{ real_name: string | null; username: string | null }>(
            'SELECT real_name, username FROM employees WHERE id = ? LIMIT 1',
            [empId],
          );
          processedName =
            String(er?.real_name || '').trim() || String(er?.username || '').trim() || null;
        }
        const mallRedemptionNotifyRef: {
          payload: {
            tenantId: string;
            memberId: string;
            redemptionId: string;
            outcome: 'completed' | 'rejected';
            itemTitle: string;
            quantity: number;
            points: number;
            note: string | null;
          } | null;
        } = { payload: null };
        try {
          await withTransaction(async (conn) => {
            const [rRows] = await conn.query(
              `SELECT * FROM redemptions WHERE id = ? AND (mall_item_id IS NOT NULL OR LOWER(TRIM(COALESCE(type,''))) = ?) FOR UPDATE`,
              [redemptionId, 'mall'],
            );
            const red = (rRows as Record<string, unknown>[])[0];
            if (!red) {
              const err = new Error('NOT_FOUND');
              (err as { code?: string }).code = 'NOT_FOUND';
              throw err;
            }

            const [mRows] = await conn.query('SELECT tenant_id FROM members WHERE id = ? LIMIT 1', [red.member_id]);
            const memTenant = (mRows as { tenant_id?: string | null }[])[0]?.tenant_id;
            if (String(memTenant || '') !== String(tenantId)) {
              const err = new Error('FORBIDDEN');
              (err as { code?: string }).code = 'FORBIDDEN';
              throw err;
            }

            const currentStatus = String(red.status || '').toLowerCase().trim();
            if (action === 'cancel') {
              if (currentStatus !== 'completed') {
                const err = new Error('ONLY_COMPLETED_CAN_CANCEL');
                (err as { code?: string }).code = 'ONLY_COMPLETED_CAN_CANCEL';
                throw err;
              }
            } else if (currentStatus !== 'pending') {
              const err = new Error('ALREADY_PROCESSED');
              (err as { code?: string }).code = 'ALREADY_PROCESSED';
              throw err;
            }

            const cost = Number(red.points_used ?? 0);
            const [aRows] = await conn.query(
              'SELECT id, COALESCE(balance,0) AS balance, COALESCE(frozen_points,0) AS frozen_points, tenant_id FROM points_accounts WHERE member_id = ? FOR UPDATE',
              [red.member_id],
            );
            const acct = (aRows as { id: string; balance: number; frozen_points: number; tenant_id: string | null }[])[0];
            if (!acct) {
              throw new Error('POINTS_ACCOUNT_NOT_FOUND');
            }
            const frozen = Number(acct.frozen_points);

            if (action === 'complete') {
              if (cost > 0 && frozen >= cost) {
                await conn.query(
                  `UPDATE points_accounts SET frozen_points = frozen_points - ?, total_spent = total_spent + ?, updated_at = NOW(3) WHERE id = ?`,
                  [cost, cost, acct.id],
                );
                const [balRows] = await conn.query('SELECT COALESCE(balance,0) AS b FROM points_accounts WHERE id = ?', [acct.id]);
                const balAfter = Number((balRows as { b?: unknown }[])[0]?.b ?? 0);
                const confirmDesc = `Mall redemption completed (${String(red.item_title || 'Product')} ×${Math.max(1, Math.floor(Number(red.quantity ?? 1)))}, ${cost} pts)`;
                await conn.query(
                  `INSERT INTO points_ledger (id, account_id, member_id, type, amount, balance_after, reference_type, reference_id, description, created_by, tenant_id, created_at)
                   VALUES (?, ?, ?, 'redeem_confirmed', 0, ?, 'mall_redemption_confirm', ?, ?, ?, ?, NOW(3))`,
                  [
                    randomUUID(),
                    acct.id,
                    String(red.member_id),
                    balAfter,
                    String(redemptionId),
                    confirmDesc,
                    empId || null,
                    acct.tenant_id,
                  ],
                );
                // amount=0: balance already deducted at freeze; only frozen→spent accounting here
                await syncPointsLog(conn, String(red.member_id), 0, 'redeem_confirmed', confirmDesc, acct.tenant_id, balAfter);
              }
            } else if (action === 'cancel') {
              const qty = Math.max(1, Math.floor(Number(red.quantity ?? 1)));
              const mallItemIdRaw = red.mall_item_id != null ? String(red.mall_item_id).trim() : '';

              if (cost > 0) {
                const totalSpent = Number(
                  ((await conn.query('SELECT COALESCE(total_spent,0) AS ts FROM points_accounts WHERE id = ?', [acct.id]))[0] as { ts?: unknown }[])[0]?.ts ?? 0,
                );
                const spentDeduct = Math.min(cost, totalSpent);
                await conn.query(
                  `UPDATE points_accounts SET balance = balance + ?, total_spent = GREATEST(total_spent - ?, 0), updated_at = NOW(3) WHERE id = ?`,
                  [cost, spentDeduct, acct.id],
                );
                const [balRows] = await conn.query('SELECT COALESCE(balance,0) AS b FROM points_accounts WHERE id = ?', [acct.id]);
                const afterBal = Number((balRows as { b?: unknown }[])[0]?.b ?? 0);
                const cancelDesc = `Mall redemption cancelled, refunded (${String(red.item_title || 'Product')} ×${qty}, ${cost} pts refunded${note ? `, note: ${String(note)}` : ''})`;
                await conn.query(
                  `INSERT INTO points_ledger (id, account_id, member_id, type, amount, balance_after, reference_type, reference_id, description, created_by, tenant_id, created_at)
                   VALUES (?, ?, ?, 'redeem_cancelled', ?, ?, 'mall_redemption_cancel', ?, ?, ?, ?, NOW(3))`,
                  [
                    randomUUID(),
                    acct.id,
                    String(red.member_id),
                    cost,
                    afterBal,
                    String(redemptionId),
                    cancelDesc,
                    empId || null,
                    acct.tenant_id,
                  ],
                );
                await syncPointsLog(conn, String(red.member_id), cost, 'redeem_cancelled', cancelDesc, acct.tenant_id, afterBal);
              }

              if (mallItemIdRaw && /^[0-9a-f-]{36}$/i.test(mallItemIdRaw)) {
                const [stRows] = await conn.query(
                  'SELECT COALESCE(stock_remaining, -1) AS sr FROM member_points_mall_items WHERE id = ? FOR UPDATE',
                  [mallItemIdRaw],
                );
                const sr = Number((stRows as { sr?: unknown }[])[0]?.sr ?? -1);
                if (Number.isFinite(sr) && sr >= 0) {
                  await conn.query('UPDATE member_points_mall_items SET stock_remaining = stock_remaining + ? WHERE id = ?', [
                    qty,
                    mallItemIdRaw,
                  ]);
                }
              }
            } else {
              const qty = Math.max(1, Math.floor(Number(red.quantity ?? 1)));
              const mallItemIdRaw = red.mall_item_id != null ? String(red.mall_item_id).trim() : '';

              if (cost > 0 && frozen >= cost) {
                await conn.query(
                  `UPDATE points_accounts SET frozen_points = frozen_points - ?, balance = balance + ?, updated_at = NOW(3) WHERE id = ?`,
                  [cost, cost, acct.id],
                );
                const afterBal = Number(acct.balance) + cost;
                const rejectDesc = `Mall redemption rejected, refunded (${String(red.item_title || 'Product')}, ${cost} pts refunded${note ? `, note: ${String(note)}` : ''})`;
                await conn.query(
                  `INSERT INTO points_ledger (id, account_id, member_id, type, amount, balance_after, reference_type, reference_id, description, created_by, tenant_id, created_at)
                   VALUES (?, ?, ?, 'redeem_rejected', ?, ?, 'mall_redemption_reject', ?, ?, ?, ?, NOW(3))`,
                  [
                    randomUUID(),
                    acct.id,
                    String(red.member_id),
                    cost,
                    afterBal,
                    String(redemptionId),
                    rejectDesc,
                    empId || null,
                    acct.tenant_id,
                  ],
                );
                await syncPointsLog(conn, String(red.member_id), cost, 'redeem_rejected', rejectDesc, acct.tenant_id, afterBal);
              } else if (cost > 0) {
                await addPoints(conn, {
                  memberId: String(red.member_id),
                  amount: cost,
                  type: 'refund',
                  referenceType: 'redemption',
                  referenceId: String(redemptionId),
                  description: `Refund: ${String(red.item_title || 'Rejected redemption')}`,
                  extras: { tenant_id: memTenant ?? null },
                });
              }

              if (mallItemIdRaw && /^[0-9a-f-]{36}$/i.test(mallItemIdRaw)) {
                const [stRows] = await conn.query(
                  'SELECT COALESCE(stock_remaining, -1) AS sr FROM member_points_mall_items WHERE id = ? FOR UPDATE',
                  [mallItemIdRaw],
                );
                const sr = Number((stRows as { sr?: unknown }[])[0]?.sr ?? -1);
                if (Number.isFinite(sr) && sr >= 0) {
                  await conn.query('UPDATE member_points_mall_items SET stock_remaining = stock_remaining + ? WHERE id = ?', [
                    qty,
                    mallItemIdRaw,
                  ]);
                }
              }
            }

            await conn.query(
              `UPDATE redemptions SET status = ?, process_note = ?, processed_at = NOW(3),
                processed_by_employee_id = ?, processed_by_name = ?
               WHERE id = ? AND (mall_item_id IS NOT NULL OR LOWER(TRIM(COALESCE(type,''))) = ?)`,
              [newStatus, note, empId || null, processedName, redemptionId, 'mall'],
            );

            const qtyN = Math.max(1, Math.floor(Number(red.quantity ?? 1)));
            mallRedemptionNotifyRef.payload = {
              tenantId: String(memTenant || tenantId || ''),
              memberId: String(red.member_id),
              redemptionId: String(redemptionId),
              outcome: action === 'complete' ? 'completed' : action === 'cancel' ? 'rejected' : 'rejected',
              itemTitle: String(red.item_title || 'Item'),
              quantity: qtyN,
              points: cost,
              note: note != null ? String(note) : null,
            };
          });
          result = { success: true, status: newStatus };

          insertOperationLogRepository({
            operator_id: empId || null,
            operator_account: processedName || 'employee',
            operator_role: req.user?.role ?? 'employee',
            module: 'points_redemption',
            operation_type: action === 'complete' ? 'status_change' : action === 'cancel' ? 'cancel' : 'reject',
            object_id: String(redemptionId),
            object_description: `Mall redemption ${action === 'complete' ? 'Completed' : action === 'cancel' ? 'Cancelled' : 'Rejected'}: ${mallRedemptionNotifyRef.payload?.itemTitle ?? 'Product'}`,
            before_data: { status: action === 'cancel' ? 'completed' : 'pending' },
            after_data: { status: newStatus, note },
            ip_address: req.ip ?? null,
          }).catch(err => console.error('[RPC] mall redemption operation log:', err));

          const mallPayload = mallRedemptionNotifyRef.payload;
          if (mallPayload?.tenantId && mallPayload.memberId) {
            try {
              const { notifyMemberMallRedemptionOutcome } = await import('../memberInboxNotifications/repository.js');
              await notifyMemberMallRedemptionOutcome(mallPayload);
            } catch (ne) {
              console.warn('[member-inbox] mall redemption:', ((ne as Error).message || '').slice(0, 160));
            }
          }
        } catch (e: unknown) {
          const code = (e as { code?: string }).code;
          const msg = (e as Error).message || 'PROCESS_FAILED';
          result = { success: false, error: code || msg };
        }
        break;
      }

      case 'list_my_member_points_mall_items': {
        if (!assertRpcEmployee(req)) {
          result = { success: false, error: 'EMPLOYEE_ONLY', items: [] };
          break;
        }
        if (!tenantId) {
          result = { success: true, items: [] };
          break;
        }
        const rawItems = await query(
          'SELECT * FROM member_points_mall_items WHERE tenant_id = ? ORDER BY sort_order ASC, created_at DESC',
          [tenantId],
        );
        const items = (rawItems as Record<string, unknown>[]).map((row) => ({
          ...row,
          title: row.title ?? row.name ?? '',
        }));
        result = { success: true, items };
        break;
      }

      case 'list_my_member_points_mall_redemptions': {
        if (!assertRpcEmployee(req)) {
          result = { success: false, error: 'EMPLOYEE_ONLY', items: [] };
          break;
        }
        const status = params.p_status || null;
        const limit = Math.min(parseInt(String(params.p_limit)) || 50, 500);
        if (!tenantId) {
          result = { success: true, items: [] };
          break;
        }
        const whereParts = ['m.tenant_id = ?', '(r.mall_item_id IS NOT NULL OR r.type = ?)'];
        const vals: unknown[] = [tenantId, 'mall'];
        if (status) {
          whereParts.push('r.status = ?');
          vals.push(status);
        }
        vals.push(limit);
        const items = await query(
          `SELECT r.id, r.member_id, m.member_code,
            COALESCE(NULLIF(TRIM(r.member_phone_snapshot), ''), m.phone_number) AS member_phone,
            COALESCE(NULLIF(TRIM(r.item_title), ''), i.title, 'Mall product') AS item_title,
            COALESCE(r.item_image_url, i.image_url) AS item_image_url,
            COALESCE(r.quantity, 1) AS quantity,
            COALESCE(r.points_used, 0) AS points_used,
            COALESCE(r.status, 'pending') AS status,
            r.created_at, r.processed_at, r.process_note,
            COALESCE(NULLIF(TRIM(r.processed_by_name), ''), NULLIF(TRIM(e.real_name), ''), e.username) AS handler_name
          FROM redemptions r
          INNER JOIN members m ON m.id = r.member_id
          LEFT JOIN member_points_mall_items i ON i.id = r.mall_item_id
          LEFT JOIN employees e ON e.id = r.processed_by_employee_id
          WHERE ${whereParts.join(' AND ')}
          ORDER BY r.created_at DESC
          LIMIT ?`,
          vals,
        );
        result = { success: true, items };
        break;
      }

      case 'list_my_member_spin_wheel_prizes': {
        if (!assertRpcEmployee(req)) {
          result = { success: false, error: 'EMPLOYEE_ONLY', prizes: [] };
          break;
        }
        let prizes: unknown[];
        if (req.user?.is_platform_super_admin) {
          prizes = await query(
            'SELECT * FROM member_spin_wheel_prizes ORDER BY sort_order ASC, created_at DESC',
          );
        } else {
          const tidP = req.user?.tenant_id ?? null;
          prizes = tidP
            ? await query(
                'SELECT * FROM member_spin_wheel_prizes WHERE tenant_id = ? ORDER BY sort_order ASC, created_at DESC',
                [tidP],
              )
            : [];
        }
        result = { success: true, prizes };
        break;
      }

      case 'member_spin': {
        /** 与会员转盘页统一：走 lottery 抽奖（lottery_logs + lottery_prizes），不再写 spins 表 */
        const memberId = effectiveMemberIdForRpc(req, params);
        if (!memberId) {
          result = { success: false, error: 'INVALID_PARAMS' };
          break;
        }
        const clientRequestId = typeof params?.request_id === 'string' ? params.request_id.trim() : '';
        const rpcRequestId = clientRequestId || `srv_${randomUUID().replace(/-/g, '')}`;
        const rpcIp = (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || null;
        const rpcFp = typeof params?.device_fingerprint === 'string' ? params.device_fingerprint.slice(0, 128) : null;
        const dr = await draw(memberId, { requestId: rpcRequestId, clientIp: rpcIp, deviceFingerprint: rpcFp });
        if (!dr.success) {
          result = {
            success: false,
            error: dr.error ?? 'DRAW_FAILED',
            remaining: dr.remaining ?? 0,
          };
          break;
        }
        result = {
          success: true,
          remaining: dr.remaining,
          prize: dr.prize
            ? {
                id: dr.prize.id,
                name: dr.prize.name,
                type: dr.prize.type,
                value: dr.prize.value,
              }
            : undefined,
          reward_status: dr.reward_status,
          reward_points: dr.reward_points,
          balance_after: dr.balance_after,
          fail_reason: dr.fail_reason,
        };
        break;
      }

      /**
       * 分享领奖凭证：前端在打开分享页之前调用，后端返回一次性 nonce（5 分钟有效）。
       * 前端把 nonce 传给 member_grant_spin_for_share 作为领取凭证。
       */
      case 'member_request_share_nonce': {
        const memberId = effectiveMemberIdForRpc(req, params);
        if (!memberId) {
          result = { success: false, error: 'INVALID_PARAMS' };
          break;
        }
        try {
          const mRow = await queryOne<{ tenant_id: string | null }>('SELECT tenant_id FROM members WHERE id = ?', [memberId]);
          if (!mRow) { result = { success: false, error: 'MEMBER_NOT_FOUND' }; break; }

          const plainNonce = randomBytes(16).toString('hex');
          const nonceHash = createHash('sha256').update(plainNonce, 'utf8').digest('hex');
          const id = randomUUID();
          const NONCE_TTL_SEC = 300;
          await execute(
            `INSERT INTO share_nonces (id, member_id, tenant_id, nonce_hash, expires_at, created_at)
             VALUES (?, ?, ?, ?, DATE_ADD(NOW(3), INTERVAL ? SECOND), NOW(3))`,
            [id, memberId, mRow.tenant_id, nonceHash, NONCE_TTL_SEC],
          );
          result = { success: true, nonce: plainNonce, expires_in: NONCE_TTL_SEC };
        } catch (e) {
          console.error('[RPC] member_request_share_nonce', e);
          result = { success: false, error: 'NONCE_FAILED' };
        }
        break;
      }

      case 'member_grant_spin_for_share': {
        const memberId = effectiveMemberIdForRpc(req, params);
        if (!memberId) {
          result = { success: false, error: 'INVALID_PARAMS' };
          break;
        }
        const rawNonce = String(params.p_share_nonce || '').trim();
        if (!rawNonce || rawNonce.length < 16) {
          result = { success: false, error: 'INVALID_SHARE_NONCE' };
          break;
        }
        const nonceHash = createHash('sha256').update(rawNonce, 'utf8').digest('hex');
        try {
          result = await withTransaction(async (conn) => {
            const shareLock = buildMysqlUserLockName('share_spin', memberId);
            if (!(await mysqlGetLock(conn, shareLock, 6))) {
              return { success: false, error: 'DUPLICATE_REQUEST' };
            }
            try {
            // Validate and consume nonce atomically
            const [nonceRows] = await conn.query(
              `SELECT id, member_id, used_at, expires_at FROM share_nonces
               WHERE nonce_hash = ? FOR UPDATE`,
              [nonceHash],
            );
            const nonceRow = (nonceRows as { id: string; member_id: string; used_at: Date | null; expires_at: Date }[])[0];
            if (!nonceRow) {
              return { success: false, error: 'INVALID_SHARE_NONCE' };
            }
            if (nonceRow.member_id !== memberId) {
              return { success: false, error: 'INVALID_SHARE_NONCE' };
            }
            if (nonceRow.used_at) {
              return { success: false, error: 'NONCE_ALREADY_USED' };
            }
            if (new Date(nonceRow.expires_at).getTime() < Date.now()) {
              return { success: false, error: 'NONCE_EXPIRED' };
            }
            // Mark nonce as consumed
            await conn.query('UPDATE share_nonces SET used_at = NOW(3) WHERE id = ? AND used_at IS NULL', [nonceRow.id]);

            const [mRows] = await conn.query('SELECT id, tenant_id FROM members WHERE id = ? FOR UPDATE', [memberId]);
            const mRow = (mRows as { id: string; tenant_id: string | null }[])[0];
            if (!mRow) {
              return { success: false, error: 'MEMBER_NOT_FOUND' };
            }
            const tid = mRow.tenant_id ?? null;
            let shareReward = 1;
            let dailyCap = 0;
            if (tid) {
              const [sRows] = await conn.query(
                'SELECT share_reward_spins, daily_share_reward_limit FROM member_portal_settings WHERE tenant_id = ? LIMIT 1',
                [tid],
              );
              const s = (sRows as { share_reward_spins: number | string | null; daily_share_reward_limit?: number | null }[])[0];
              if (s?.share_reward_spins != null && s.share_reward_spins !== '') {
                shareReward = Math.max(0, Math.ceil(Number(s.share_reward_spins)));
              }
              dailyCap = Math.max(0, Number(s?.daily_share_reward_limit ?? 0));
            }
            if (shareReward <= 0) {
              return { success: false, error: 'SHARE_REWARD_DISABLED' };
            }
            if (dailyCap > 0) {
              const [sumRows] = await conn.query(
                `SELECT COALESCE(SUM(amount), 0) AS total FROM spin_credits
                 WHERE member_id = ? AND source = 'share'
                   AND created_at >= CURDATE()
                   AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)`,
                [memberId],
              );
              const todaySpins = Number((sumRows as { total: number }[])[0]?.total ?? 0);
              if (todaySpins + shareReward > dailyCap) {
                return { success: false, error: 'SHARE_DAILY_CAP_REACHED', cap: dailyCap, today: todaySpins };
              }
            }
            const id = randomUUID();
            await conn.query(
              'INSERT INTO spin_credits (id, member_id, amount, source, created_at) VALUES (?, ?, ?, ?, NOW())',
              [id, memberId, shareReward, 'share'],
            );
            await incrementLotterySpinBalanceConn(conn, memberId, shareReward, 'share');
            const [sumAfter] = await conn.query(
              `SELECT COALESCE(SUM(amount), 0) AS total FROM spin_credits
               WHERE member_id = ? AND source = 'share'
                 AND created_at >= CURDATE()
                 AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)`,
              [memberId],
            );
            const shareCreditsToday = Number((sumAfter as { total: number }[])[0]?.total ?? 0);
            const capReached = dailyCap > 0 && shareCreditsToday >= dailyCap;
            return {
              success: true,
              credits: shareReward,
              share_claimed_today: capReached,
              share_credits_today: shareCreditsToday,
              daily_share_cap: dailyCap,
            };
            } finally {
              await mysqlReleaseLock(conn, shareLock);
            }
          });
        } catch (e) {
          console.error('[RPC] member_grant_spin_for_share', e);
          result = { success: false, error: 'SAVE_FAILED', message: (e as Error).message };
        }
        break;
      }

      case 'member_update_nickname': {
        const memberId = effectiveMemberIdForRpc(req, params);
        if (!memberId) {
          result = { success: false, error: 'INVALID_PARAMS' };
          break;
        }
        await execute('UPDATE members SET nickname = ? WHERE id = ?', [params.p_nickname, memberId]);
        result = { success: true };
        break;
      }

      case 'member_update_avatar': {
        const memberId = effectiveMemberIdForRpc(req, params);
        if (!memberId) {
          result = { success: false, error: 'INVALID_PARAMS' };
          break;
        }
        const avatarUrl = params.p_avatar_url != null ? String(params.p_avatar_url).trim() : null;
        // 限制 data URL 大小 ≤ 200KB（压缩后 WebP / JPEG）
        if (avatarUrl && avatarUrl.length > 200_000) {
          result = { success: false, error: 'AVATAR_TOO_LARGE' };
          break;
        }
        await execute('UPDATE members SET avatar_url = ? WHERE id = ?', [avatarUrl || null, memberId]);
        result = { success: true };
        break;
      }

      case 'member_get_orders': {
        const memberId = effectiveMemberIdForRpc(req, params);
        if (!memberId) {
          result = { rows: [], total: 0 };
          break;
        }
        const m = await queryOne<{ phone_number: string | null }>(
          'SELECT phone_number FROM members WHERE id = ?',
          [memberId]
        );
        const phone = String(m?.phone_number ?? '').trim();
        const ordLim = Math.min(200, Math.max(1, Math.floor(Number(params.p_limit) || 20)));
        const ordOff = Math.max(0, Math.floor(Number(params.p_offset) || 0));

        const countRow = await queryOne<{ n: number }>(
          `SELECT COUNT(*) AS n FROM orders o
           WHERE (o.member_id = ? OR (o.phone_number IS NOT NULL AND o.phone_number = ?))
           AND COALESCE(o.is_deleted, 0) = 0`,
          [memberId, phone],
        );
        const ordTotal = Math.max(0, Number(countRow?.n ?? 0));

        const orders = await query(
          `SELECT o.*,
                  o.card_type AS order_type,
                  COALESCE(NULLIF(TRIM(gc.name), ''), NULLIF(TRIM(o.card_name), '')) AS gift_card_name
           FROM orders o
           LEFT JOIN gift_cards gc ON gc.id = TRIM(o.card_type)
           WHERE (o.member_id = ? OR (o.phone_number IS NOT NULL AND o.phone_number = ?))
           AND COALESCE(o.is_deleted, 0) = 0
           ORDER BY o.created_at DESC
           LIMIT ? OFFSET ?`,
          [memberId, phone, ordLim, ordOff]
        );
        result = { rows: orders, total: ordTotal };
        break;
      }

      case 'member_get_points': {
        const memberId = effectiveMemberIdForRpc(req, params);
        const acct = memberId
          ? await queryOne<{ balance: number; frozen_points: number }>(
              'SELECT COALESCE(balance, 0) AS balance, COALESCE(frozen_points, 0) AS frozen_points FROM points_accounts WHERE member_id = ?',
              [memberId],
            )
          : null;
        const pts = Number(acct?.balance ?? 0);
        const frozen = Number(acct?.frozen_points ?? 0);
        result = { success: true, points: pts, balance: pts, frozen_points: frozen, total_points: pts + frozen };
        break;
      }

      case 'member_get_points_breakdown': {
        const memberId = effectiveMemberIdForRpc(req, params);
        if (!memberId) {
          result = {
            success: true,
            balance: 0,
            frozen_points: 0,
            total_points: 0,
            consumption_points: 0,
            referral_points: 0,
            lottery_points: 0,
            pending_mall_points: 0,
            referral_count: 0,
          };
          break;
        }
        const { computeMemberPointsBreakdown } = await import('../points/memberPointsBreakdown.js');
        result = await computeMemberPointsBreakdown(memberId);
        break;
      }

      /** 会员端：积分流水（全部/消费/推广/抽奖），订单号、时间、积分变动、变动前后余额 */
      case 'member_list_points_ledger': {
        const memberId = effectiveMemberIdForRpc(req, params);
        if (!memberId) {
          result = { success: false, error: 'UNAUTHORIZED', rows: [], total: 0 };
          break;
        }
        const cat = String(params.p_category || 'all').toLowerCase();
        if (cat !== 'all' && cat !== 'consumption' && cat !== 'referral' && cat !== 'lottery') {
          result = { success: false, error: 'INVALID_CATEGORY', rows: [], total: 0 };
          break;
        }
        const limit = Number(params.p_limit);
        const offset = Number(params.p_offset);
        const { listMemberPointsLedgerHistory } = await import('../points/memberPointsLedgerHistory.js');
        const { rows, total } = await listMemberPointsLedgerHistory(
          memberId,
          cat as 'all' | 'consumption' | 'referral' | 'lottery',
          Number.isFinite(limit) ? limit : 50,
          Number.isFinite(offset) ? offset : 0
        );
        result = { success: true, rows, total };
        break;
      }

      case 'member_sum_today_earned': {
        const memberId = effectiveMemberIdForRpc(req, params);
        if (!memberId) {
          result = { success: false, error: 'UNAUTHORIZED', earned: 0 };
          break;
        }
        const { sumMemberTodayEarnedPoints } = await import('../points/memberPointsLedgerHistory.js');
        const earned = await sumMemberTodayEarnedPoints(memberId);
        result = { success: true, earned };
        break;
      }

      /** 员工端汇率计算器：积分全额兑换并写活动赠送（与 Supabase redeem_points_and_record 语义对齐，账务以 points_accounts.balance 为准） */
      case 'redeem_points_and_record': {
        if (!assertRpcEmployee(req)) {
          result = { success: false, error: 'FORBIDDEN' };
          break;
        }
        const p_member_code = String(params.p_member_code || '').trim();
        const p_phone = String(params.p_phone || '').trim();
        const p_member_id = String(params.p_member_id || '').trim();
        const p_points_to_redeem = Math.round(Number(params.p_points_to_redeem));
        const p_activity_type = String(params.p_activity_type || 'activity_1');
        const p_gift_currency = String(params.p_gift_currency || '');
        const p_gift_amount = Number(params.p_gift_amount);
        const p_gift_rate = Number(params.p_gift_rate);
        const p_gift_fee = Number(params.p_gift_fee);
        const p_gift_value = Number(params.p_gift_value);
        const p_payment_agent = params.p_payment_agent != null && String(params.p_payment_agent).trim() !== ''
          ? String(params.p_payment_agent).trim()
          : '-';
        const p_creator_id = params.p_creator_id ? String(params.p_creator_id) : null;

        if (!p_member_id || !Number.isFinite(p_points_to_redeem) || p_points_to_redeem <= 0) {
          result = { success: false, error: 'INVALID_PARAMS' };
          break;
        }

        const memberRow = await queryOne<{ tenant_id: string | null }>(
          'SELECT tenant_id FROM members WHERE id = ?',
          [p_member_id],
        );
        if (!memberRow) {
          result = { success: false, error: 'MEMBER_NOT_FOUND' };
          break;
        }
        if (
          tenantId &&
          memberRow.tenant_id !== tenantId &&
          !isAdmin &&
          !req.user?.is_platform_super_admin
        ) {
          result = { success: false, error: 'FORBIDDEN' };
          break;
        }

        const acctBal = await queryOne<{ balance: number }>(
          'SELECT balance FROM points_accounts WHERE member_id = ?',
          [p_member_id],
        );
        const curPts = Math.round(Number(acctBal?.balance ?? 0));

        if (curPts <= 0) {
          result = {
            success: false,
            error: 'NO_POINTS',
            current: curPts,
            requested: p_points_to_redeem,
          };
          break;
        }

        if (curPts !== p_points_to_redeem) {
          result = {
            success: false,
            error: 'POINTS_MISMATCH',
            current: curPts,
            requested: p_points_to_redeem,
          };
          break;
        }

        const v_transaction_type =
          p_activity_type === 'activity_1'
            ? 'redeem_activity_1'
            : p_activity_type === 'activity_2'
              ? 'redeem_activity_2'
              : 'redeem_activity_2';

        const tenantIdForLedger = memberRow.tenant_id ?? null;
        let giftIdOut = '';
        let ledgerIdOut = '';
        const redemptionRemark = buildStaffPointsRedemptionRemark(
          p_points_to_redeem,
          p_gift_amount,
          p_gift_currency
        );

        try {
          await withTransaction(async (conn) => {
            const ledgerId = randomUUID();
            ledgerIdOut = ledgerId;
            await applyPointsLedgerDeltaOnConn(conn, {
              ledgerId,
              memberId: p_member_id,
              type: v_transaction_type,
              delta: -p_points_to_redeem,
              description: redemptionRemark,
              referenceType: 'redemption',
              referenceId: ledgerId,
              createdBy: p_creator_id,
              extras: {
                member_code: p_member_code || null,
                phone_number: p_phone || null,
                transaction_type: v_transaction_type,
                points_earned: -p_points_to_redeem,
                status: 'issued',
                currency: p_gift_currency || null,
                creator_id: p_creator_id,
                tenant_id: tenantIdForLedger,
              },
            });
            await syncPointsLog(conn, p_member_id, -p_points_to_redeem, v_transaction_type, redemptionRemark, tenantIdForLedger);

            const giftId = randomUUID();
            giftIdOut = giftId;
            const gn = await generateUniqueActivityGiftNumber();
            await conn.query(
              `INSERT INTO activity_gifts (
                id, tenant_id, member_id, phone_number, currency, amount, rate, fee, gift_value, gift_type,
                payment_agent, creator_id, gift_number, remark, status, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NOW(3))`,
              [
                giftId,
                tenantIdForLedger,
                p_member_id,
                p_phone,
                p_gift_currency,
                p_gift_amount,
                p_gift_rate,
                p_gift_fee,
                p_gift_value,
                p_activity_type,
                p_payment_agent,
                p_creator_id,
                gn,
                redemptionRemark,
              ],
            );

            const ngnAdd = p_gift_currency === 'NGN' ? p_gift_amount : 0;
            const ghsAdd = p_gift_currency === 'GHS' ? p_gift_amount : 0;
            const usdtAdd = p_gift_currency === 'USDT' ? p_gift_amount : 0;

            const [maRows] = await conn.query('SELECT id FROM member_activity WHERE member_id = ? LIMIT 1', [
              p_member_id,
            ]);
            const maList = maRows as { id: string }[];
            if (maList.length > 0) {
              await conn.query(
                `UPDATE member_activity SET
                  total_gift_ngn = total_gift_ngn + ?,
                  total_gift_ghs = total_gift_ghs + ?,
                  total_gift_usdt = total_gift_usdt + ?,
                  accumulated_profit = GREATEST(accumulated_profit - ?, 0),
                  updated_at = NOW(3)
                 WHERE member_id = ?`,
                [ngnAdd, ghsAdd, usdtAdd, p_gift_value, p_member_id],
              );
            } else {
              const newMaId = randomUUID();
              await conn.query(
                `INSERT INTO member_activity (
                  id, member_id, phone_number, order_count, remaining_points,
                  accumulated_profit, accumulated_profit_usdt,
                  total_accumulated_ngn, total_accumulated_ghs, total_accumulated_usdt,
                  referral_count, accumulated_points, referral_points,
                  total_gift_ngn, total_gift_ghs, total_gift_usdt,
                  created_at, updated_at
                ) VALUES (?, ?, ?, 0, 0, GREATEST(0 - ?, 0), 0, 0, 0, 0, 0, 0, 0, ?, ?, ?, NOW(3), NOW(3))`,
                [newMaId, p_member_id, p_phone || null, p_gift_value, ngnAdd, ghsAdd, usdtAdd],
              );
            }
          });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          if (msg.includes('INSUFFICIENT_POINTS')) {
            result = {
              success: false,
              error: 'POINTS_MISMATCH',
              current: curPts,
              requested: p_points_to_redeem,
            };
          } else {
            console.error('[RPC] redeem_points_and_record', e);
            result = { success: false, error: msg || 'REDEEM_FAILED' };
          }
          break;
        }

        result = {
          success: true,
          ledger_id: ledgerIdOut,
          gift_id: giftIdOut,
          points_redeemed: p_points_to_redeem,
          points_before: curPts,
        };
        break;
      }

      case 'member_get_spin_quota': {
        const memberId = effectiveMemberIdForRpc(req, params);
        if (!memberId) {
          result = { success: false, error: 'INVALID_PARAMS' };
          break;
        }
        const q = await getQuota(memberId);
        result = {
          success: true,
          remaining: q.remaining,
          daily_free: q.daily_free,
          credits: q.credits,
          used_today: q.used_today,
        };
        break;
      }

      case 'member_list_points_mall_items': {
        const memberId = effectiveMemberIdForRpc(req, params);
        let tid: string | null = null;
        if (memberId) {
          const member = await queryOne<{ tenant_id: string | null }>('SELECT tenant_id FROM members WHERE id = ?', [memberId]);
          tid = member?.tenant_id ?? null;
        }
        const rawMall = tid
          ? await query(
              `SELECT i.*, COALESCE(pop.redeem_qty, 0) AS tenant_redeem_qty
               FROM member_points_mall_items i
               LEFT JOIN (
                 SELECT r.mall_item_id AS mid, SUM(COALESCE(r.quantity, 1)) AS redeem_qty
                 FROM redemptions r
                 INNER JOIN members m ON m.id = r.member_id AND m.tenant_id <=> ?
                 WHERE r.status != 'rejected' AND r.mall_item_id IS NOT NULL AND r.type = 'mall'
                 GROUP BY r.mall_item_id
               ) pop ON pop.mid = i.id
               WHERE i.tenant_id = ? AND i.enabled = 1
               ORDER BY i.sort_order ASC, i.created_at DESC`,
              [tid, tid],
            )
          : [];
        const items = (rawMall as Record<string, unknown>[]).map((row) => ({
          ...row,
          title: row.title ?? row.name ?? '',
        }));
        if (memberId && items.length > 0) {
          const ids = items.map((i) => String((i as { id?: string }).id || '')).filter(Boolean);
          if (ids.length > 0) {
            const ph = ids.map(() => '?').join(',');
            const usageRows = await query<{ id: string; used_today: string | number; used_lifetime: string | number }>(
              `SELECT mall_item_id AS id,
                COALESCE(SUM(CASE WHEN created_at >= CURDATE() AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY) THEN quantity ELSE 0 END), 0) AS used_today,
                COALESCE(SUM(quantity), 0) AS used_lifetime
               FROM redemptions
               WHERE member_id = ? AND status != 'rejected' AND mall_item_id IN (${ph})
               GROUP BY mall_item_id`,
              [memberId, ...ids],
            );
            const usageMap = new Map(
              usageRows.map((r) => [String(r.id), { used_today: Number(r.used_today) || 0, used_lifetime: Number(r.used_lifetime) || 0 }]),
            );
            for (const it of items) {
              const id = String((it as { id?: string }).id || '');
              const u = usageMap.get(id) ?? { used_today: 0, used_lifetime: 0 };
              (it as Record<string, unknown>).used_today = u.used_today;
              (it as Record<string, unknown>).used_lifetime = u.used_lifetime;
            }
          }
        } else {
          for (const it of items) {
            (it as Record<string, unknown>).used_today = 0;
            (it as Record<string, unknown>).used_lifetime = 0;
          }
        }
        result = { success: true, items };
        break;
      }

      /** 会员门户「兑换记录」：禁止走 table 代理（会员 JWT 会 403），统一 RPC 按 member_id 拉取并解析名称 */
      case 'member_list_points_mall_redemptions': {
        const memberId = effectiveMemberIdForRpc(req, params);
        const limit = Math.min(Math.max(parseInt(String(params.p_limit), 10) || 20, 1), 500);
        if (!memberId) {
          result = { success: false, error: 'INVALID_PARAMS', items: [] };
          break;
        }
        const items = await query(
          `SELECT r.id,
            COALESCE(
              NULLIF(TRIM(r.item_title), ''),
              NULLIF(TRIM(i.title), ''),
              NULLIF(TRIM(i.name), ''),
              NULLIF(TRIM(p.name), ''),
              '—'
            ) AS prize_name,
            COALESCE(r.quantity, 1) AS quantity,
            COALESCE(r.status, 'pending') AS status,
            r.created_at,
            COALESCE(r.points_used, 0) AS points_used
          FROM redemptions r
          LEFT JOIN member_points_mall_items i ON i.id = r.mall_item_id
          LEFT JOIN prizes p ON p.id = r.prize_id
          WHERE r.member_id = ? AND (r.mall_item_id IS NOT NULL OR r.type = ?)
          ORDER BY r.created_at DESC
          LIMIT ?`,
          [memberId, 'mall', limit],
        );
        result = { success: true, items };
        break;
      }

      case 'member_list_points_mall_categories': {
        const memberId = effectiveMemberIdForRpc(req, params);
        let tid: string | null = null;
        if (memberId) {
          const member = await queryOne<{ tenant_id: string | null }>('SELECT tenant_id FROM members WHERE id = ?', [memberId]);
          tid = member?.tenant_id ?? null;
        }
        const cats = tid
          ? await query(
              'SELECT id, name_zh, name_en, sort_order FROM member_points_mall_categories WHERE tenant_id = ? ORDER BY sort_order ASC, created_at ASC',
              [tid],
            )
          : [];
        result = { success: true, categories: cats };
        break;
      }

      case 'list_my_member_points_mall_categories': {
        if (!assertRpcEmployee(req)) {
          result = { success: false, error: 'EMPLOYEE_ONLY', categories: [] };
          break;
        }
        if (!tenantId) {
          result = { success: true, categories: [] };
          break;
        }
        const cats = await query(
          'SELECT id, name_zh, name_en, sort_order FROM member_points_mall_categories WHERE tenant_id = ? ORDER BY sort_order ASC, created_at ASC',
          [tenantId],
        );
        result = { success: true, categories: cats };
        break;
      }

      case 'save_my_member_points_mall_categories': {
        if (!assertRpcEmployee(req)) {
          result = { success: false, error: 'EMPLOYEE_ONLY' };
          break;
        }
        if (!tenantId) {
          result = { success: false, error: 'TENANT_NOT_FOUND' };
          break;
        }
        const catRows = Array.isArray(params.p_categories) ? params.p_categories : [];
        const pool = getPool();
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();
          const [exRows] = await conn.query('SELECT id FROM member_points_mall_categories WHERE tenant_id = ?', [tenantId]);
          const existingIds = new Set((exRows as { id: string }[]).map((r) => String(r.id)));
          const keepIds = new Set<string>();
          const normalized: { id: string; name_zh: string; name_en: string; sort_order: number }[] = [];
          for (let i = 0; i < catRows.length; i++) {
            const r = catRows[i] as Record<string, unknown>;
            const rid = r.id != null ? String(r.id).trim() : '';
            const id = /^[0-9a-f-]{36}$/i.test(rid) ? rid : randomUUID();
            keepIds.add(id);
            const name_zh = String(r.name_zh ?? '').trim().slice(0, 128) || 'Category';
            const name_en = String(r.name_en ?? '').trim().slice(0, 128);
            normalized.push({ id, name_zh, name_en: name_en || name_zh, sort_order: i + 1 });
          }
          for (const eid of existingIds) {
            if (!keepIds.has(eid)) {
              await conn.execute(
                'UPDATE member_points_mall_items SET mall_category_id = NULL WHERE tenant_id = ? AND mall_category_id = ?',
                [tenantId, eid],
              );
              await conn.execute('DELETE FROM member_points_mall_categories WHERE tenant_id = ? AND id = ?', [tenantId, eid]);
            }
          }
          for (const c of normalized) {
            await conn.execute(
              `INSERT INTO member_points_mall_categories (id, tenant_id, name_zh, name_en, sort_order, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, NOW(3), NOW(3))
               ON DUPLICATE KEY UPDATE name_zh = VALUES(name_zh), name_en = VALUES(name_en), sort_order = VALUES(sort_order), updated_at = NOW(3)`,
              [c.id, tenantId, c.name_zh, c.name_en, c.sort_order],
            );
          }
          await conn.commit();
          result = { success: true };
        } catch (e) {
          await conn.rollback();
          console.error('[RPC] save_my_member_points_mall_categories', e);
          result = { success: false, error: 'SAVE_FAILED', message: (e as Error).message };
        } finally {
          conn.release();
        }
        break;
      }

      case 'member_redeem_points_mall_item': {
        const memberId = effectiveMemberIdForRpc(req, params);
        const itemId = params.p_item_id;
        const qty = Math.max(1, parseInt(String(params.p_quantity)) || 1);
        if (!memberId || !itemId) {
          result = { success: false, error: 'INVALID_PARAMS' };
          break;
        }
        // Pre-validate outside transaction (read-only checks)
        const memberRow = await queryOne<{
          tenant_id: string | null;
          member_code: string | null;
          phone_number: string | null;
        }>('SELECT tenant_id, member_code, phone_number FROM members WHERE id = ?', [memberId]);
        const item = await queryOne<{
          enabled?: unknown;
          tenant_id?: unknown;
          title?: unknown;
          name?: unknown;
          stock_remaining?: unknown;
          stock?: unknown;
          per_order_limit?: unknown;
          per_user_daily_limit?: unknown;
          per_user_lifetime_limit?: unknown;
          points_cost?: unknown;
          image_url?: unknown;
        }>('SELECT * FROM member_points_mall_items WHERE id = ?', [itemId]);
        if (!item || !item.enabled) {
          result = { success: false, error: 'ITEM_NOT_FOUND' };
          break;
        }
        if (
          !memberRow?.tenant_id ||
          !item.tenant_id ||
          String(memberRow.tenant_id) !== String(item.tenant_id)
        ) {
          result = { success: false, error: 'ITEM_NOT_FOUND' };
          break;
        }
        const itemTitle =
          String(item.title ?? item.name ?? '')
            .trim() || 'Product';
        const stockRemainingRaw = item.stock_remaining;
        const stockLegacyRaw = item.stock;
        let stockRemaining = Number(stockRemainingRaw);
        if (Number.isNaN(stockRemaining)) {
          stockRemaining = Number(stockLegacyRaw);
        }
        if (Number.isNaN(stockRemaining)) stockRemaining = -1;
        const perOrder = Math.max(1, Number(item.per_order_limit ?? 1));
        if (qty > perOrder) {
          result = { success: false, error: 'EXCEED_PER_ORDER_LIMIT', limit: perOrder };
          break;
        }

        const rawIdem = params.p_client_request_id ?? params.p_idempotency_key;
        let clientRequestId = '';
        if (rawIdem != null && String(rawIdem).trim() !== '') {
          const s = String(rawIdem).trim().slice(0, 64);
          if (/^[a-zA-Z0-9_-]{8,64}$/.test(s)) clientRequestId = s;
        }
        // Auto-generate idempotency key if frontend didn't provide one
        if (!clientRequestId) {
          clientRequestId = `srv_${randomUUID().replace(/-/g, '')}`;
        }

        // All write operations + final balance/stock checks inside transaction
        try {
          result = await withTransaction(async (conn) => {
            const mallLock = buildMysqlUserLockName('mall_redeem', memberId);
            if (!(await mysqlGetLock(conn, mallLock, 8))) {
              return { success: false, error: 'DUPLICATE_REQUEST' };
            }
            try {
            // Re-check limits with row locks inside transaction
            const dailyLimit = Math.max(0, Number(item.per_user_daily_limit ?? 0));
            const lifeLimit = Math.max(0, Number(item.per_user_lifetime_limit ?? 0));
            if (dailyLimit > 0) {
              const [usedRows] = await conn.query(
                `SELECT COALESCE(SUM(quantity), 0) AS used FROM redemptions
                 WHERE member_id = ? AND mall_item_id = ? AND status != 'rejected'
                 AND created_at >= CURDATE()
                 AND created_at < DATE_ADD(CURDATE(), INTERVAL 1 DAY)`,
                [memberId, itemId],
              );
              const usedToday = Number((usedRows as { used?: unknown }[])[0]?.used ?? 0);
              if (usedToday + qty > dailyLimit) {
                return { success: false, error: 'EXCEED_DAILY_LIMIT', limit: dailyLimit, used: usedToday };
              }
            }
            if (lifeLimit > 0) {
              const [usedRows] = await conn.query(
                `SELECT COALESCE(SUM(quantity), 0) AS used FROM redemptions
                 WHERE member_id = ? AND mall_item_id = ? AND status != 'rejected'`,
                [memberId, itemId],
              );
              const usedLife = Number((usedRows as { used?: unknown }[])[0]?.used ?? 0);
              if (usedLife + qty > lifeLimit) {
                return { success: false, error: 'EXCEED_LIFETIME_LIMIT', limit: lifeLimit, used: usedLife };
              }
            }

            if (clientRequestId) {
              const [prevRows] = await conn.query(
                `SELECT mall_item_id, item_title, quantity, points_used FROM redemptions
                 WHERE member_id = ? AND client_request_id = ? LIMIT 1`,
                [memberId, clientRequestId],
              );
              const prev = (prevRows as { mall_item_id: string; item_title: string; quantity: number; points_used: number }[])[0];
              if (prev) {
                return {
                  success: true,
                  idempotent_replay: true,
                  points_used: Number(prev.points_used),
                  quantity: Number(prev.quantity ?? qty),
                  item: {
                    id: String(prev.mall_item_id),
                    title: String(prev.item_title ?? itemTitle),
                    image_url: item.image_url ?? null,
                  },
                };
              }
            }

            const cost = Number(item.points_cost ?? 0) * qty;

            // 与 point_orders 一致：待员工「完成/驳回」前冻结积分（balance↓ + frozen↑），审核入口在订单-商城兑换
            const [acctRows] = await conn.query(
              'SELECT id, COALESCE(balance, 0) AS balance, COALESCE(frozen_points, 0) AS frozen_points, tenant_id FROM points_accounts WHERE member_id = ? FOR UPDATE',
              [memberId],
            );
            const acctRow = (acctRows as { id?: string; balance?: unknown; frozen_points?: unknown; tenant_id?: string | null }[])[0];
            if (!acctRow?.id) {
              return { success: false, error: 'INSUFFICIENT_POINTS', required: cost, current: 0 };
            }
            const available = Number(acctRow.balance ?? 0);
            const frozenBefore = Number(acctRow.frozen_points ?? 0);
            if (frozenBefore > 0) {
              return { success: false, error: 'HAS_FROZEN_POINTS' };
            }
            if (!Number.isFinite(available) || available < cost) {
              return { success: false, error: 'INSUFFICIENT_POINTS', required: cost, current: available };
            }

            // Lock stock row（stock_remaining 由迁移保证；旧数据已用 stock 回填）
            if (stockRemaining >= 0) {
              const [stockRows] = await conn.query(
                'SELECT stock_remaining FROM member_points_mall_items WHERE id = ? FOR UPDATE',
                [itemId],
              );
              const currentStock = Number((stockRows as { stock_remaining?: unknown }[])[0]?.stock_remaining ?? 0);
              if (Number.isNaN(currentStock) || currentStock < qty) {
                return {
                  success: false,
                  error: 'OUT_OF_STOCK',
                  available: Number.isNaN(currentStock) ? 0 : currentStock,
                  requested: qty,
                };
              }
              await conn.query('UPDATE member_points_mall_items SET stock_remaining = stock_remaining - ? WHERE id = ?', [qty, itemId]);
            }

            const balanceAfterFreeze = available - cost;
            await conn.query(
              `UPDATE points_accounts
                 SET balance = ?,
                     frozen_points = COALESCE(frozen_points, 0) + ?,
                     updated_at = NOW(3)
               WHERE id = ?`,
              [balanceAfterFreeze, cost, acctRow.id],
            );

            const redemptionId = randomUUID();
            const freezeLedgerId = randomUUID();
            const freezeDesc =
              qty > 1 ? `Points frozen (mall redemption: ${itemTitle} ×${qty})` : `Points frozen (mall redemption: ${itemTitle})`;
            await conn.query(
              `INSERT INTO points_ledger (
                 id, account_id, member_id, type, amount, balance_after,
                 reference_type, reference_id, description, tenant_id, created_at
               ) VALUES (?, ?, ?, 'freeze', ?, ?, 'mall_redemption_freeze', ?, ?, ?, NOW(3))`,
              [
                freezeLedgerId,
                acctRow.id,
                memberId,
                -cost,
                balanceAfterFreeze,
                redemptionId,
                freezeDesc,
                acctRow.tenant_id ?? memberRow?.tenant_id ?? null,
              ],
            );
            await syncPointsLog(conn, memberId, -cost, 'freeze', freezeDesc, acctRow.tenant_id ?? memberRow?.tenant_id ?? null, balanceAfterFreeze);

            const snapPhone = memberRow?.phone_number != null ? String(memberRow.phone_number).trim().slice(0, 64) : null;
            await conn.query(
              `INSERT INTO redemptions (id, member_id, type, mall_item_id, item_title, quantity, points_used, status, created_at, client_request_id, member_phone_snapshot)
               VALUES (?, ?, 'mall', ?, ?, ?, ?, 'pending', NOW(), ?, ?)`,
              [redemptionId, memberId, itemId, itemTitle, qty, cost, clientRequestId || null, snapPhone || null],
            );

            return {
              success: true,
              points_used: cost,
              quantity: qty,
              item: { id: String(itemId), title: itemTitle, image_url: item.image_url },
            };
            } finally {
              await mysqlReleaseLock(conn, mallLock);
            }
          });
        } catch (txErr) {
          console.error('[RPC] member_redeem_points_mall_item transaction error:', txErr);
          result = { success: false, error: 'REDEEM_FAILED', message: (txErr as Error).message };
        }
        break;
      }

      // ── 积分兑换订单（冻结→审核闭环） ──

      case 'member_create_point_order': {
        const memberId = effectiveMemberIdForRpc(req, params);
        if (!memberId) { result = { success: false, error: 'UNAUTHORIZED' }; break; }
        const { createPointOrder } = await import('../points/pointOrderService.js');
        try {
          const order = await createPointOrder({
            memberId,
            productName: String(params.p_product_name || ''),
            productId: params.p_product_id ? String(params.p_product_id) : undefined,
            quantity: Math.max(1, parseInt(String(params.p_quantity)) || 1),
            pointsCost: Number(params.p_points_cost || 0),
            clientRequestId: params.p_client_request_id ? String(params.p_client_request_id) : undefined,
          });
          result = { success: true, order };
        } catch (e) {
          const msg = (e as Error).message;
          result = { success: false, error: msg };
        }
        break;
      }

      case 'member_list_point_orders': {
        const memberId = effectiveMemberIdForRpc(req, params);
        if (!memberId) { result = { success: false, error: 'UNAUTHORIZED' }; break; }
        const { listPointOrders } = await import('../points/pointOrderService.js');
        const orders = await listPointOrders({
          memberId,
          limit: Number(params.p_limit) || 50,
        });
        result = { success: true, orders };
        break;
      }

      case 'member_get_portal_settings': {
        const memberId = effectiveMemberIdForRpc(req, params);
        if (memberId) {
          const { getPortalSettingsByMember } = await import('../memberPortalSettings/service.js');
          const r = await getPortalSettingsByMember(memberId);
          result = {
            success: true,
            tenant_id: r.tenant_id,
            tenant_name: r.tenant_name || '',
            settings: r.settings || {},
          };
          break;
        }
        result = { success: true, tenant_id: null, tenant_name: '', settings: {} };
        break;
      }

      case 'validate_invite_and_submit': {
        /** 必须与 POST /api/member/register-init 换取的 registerToken 配套；禁止仅凭前端传入 tenant_id 注册 */
        const registerToken = String(params.p_register_token || '').trim();
        const inviteePhone = String(params.p_invitee_phone || '').trim();
        const rawPassword = String(params.p_password || '');
        const nickname = params.p_nickname != null ? String(params.p_nickname) : null;
        if (!registerToken) {
          result = { success: false, error: 'REGISTER_TOKEN_REQUIRED' };
          break;
        }
        if (!inviteePhone) {
          result = { success: false, error: 'INVALID_INPUT' };
          break;
        }
        try {
          const { completeInviteRegister } = await import('../memberRegister/service.js');
          const cr = await completeInviteRegister({
            registerToken,
            inviteePhone,
            password: rawPassword,
            nickname,
            clientIp: req.ip,
            userAgent: req.get('user-agent') || undefined,
          });
          result = cr.success
            ? { success: true, member_id: cr.member_id, member_code: cr.member_code }
            : { success: false, error: cr.error };
        } catch (e) {
          console.error('[RPC] validate_invite_and_submit', e);
          result = { success: false, error: 'REGISTER_FAILED' };
        }
        break;
      }

      case 'member_get_invite_token': {
        const memberId = effectiveMemberIdForRpc(req, params);
        if (!memberId) { result = { success: false, error: 'NO_MEMBER' }; break; }
        const genTok = () =>
          Array.from({ length: 8 }, () => 'abcdefghijkmnpqrstuvwxyz23456789'[Math.floor(Math.random() * 32)]).join('');
        const m = await queryOne<{ invite_token: string | null; referral_code: string | null }>(
          'SELECT invite_token, referral_code FROM members WHERE id = ?',
          [memberId],
        );
        let token = m?.invite_token?.trim() || '';
        if (!token) {
          token = genTok();
          await execute('UPDATE members SET invite_token = ?, referral_code = ? WHERE id = ?', [token, token, memberId]);
        } else if (!m?.referral_code?.trim()) {
          await execute('UPDATE members SET referral_code = ? WHERE id = ?', [token, memberId]);
        }
        result = { success: true, invite_token: token };
        break;
      }

      case 'member_log_action': {
        const memberId = effectiveMemberIdForRpc(req, params);
        const action = String(params.p_action || '').trim();
        if (memberId && action) {
          const memberRow = await queryOne<{ tenant_id: string | null }>('SELECT tenant_id FROM members WHERE id = ?', [memberId]);
          try {
            await execute(
              'INSERT INTO member_operation_logs (id, member_id, tenant_id, action, detail, created_at) VALUES (UUID(), ?, ?, ?, ?, NOW())',
              [memberId, memberRow?.tenant_id || null, action, params.p_detail || null]
            );
          } catch { /* logging best-effort */ }
        }
        result = { success: true };
        break;
      }

      case 'admin_list_spins': {
        if (!assertRpcEmployee(req)) {
          result = { success: false, error: 'FORBIDDEN', spins: [], total: 0 };
          break;
        }
        const limit = Math.min(parseInt(params.p_limit) || 100, 500);
        const offset = parseInt(params.p_offset) || 0;
        const search = String(params.p_search || '').trim();
        const sourceFilter = String(params.p_source || '').trim();
        const statusFilter = String(params.p_status || '').trim();
        const dateFrom = String(params.p_date_from || '').trim();
        let where = '1=1';
        const vals: unknown[] = [];
        if (search) {
          where += ' AND (m.phone_number LIKE ? OR m.member_code LIKE ? OR m.nickname LIKE ? OR s.result LIKE ?)';
          vals.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (sourceFilter) { where += ' AND s.source = ?'; vals.push(sourceFilter); }
        if (statusFilter) { where += ' AND s.status = ?'; vals.push(statusFilter); }
        if (dateFrom) { where += ' AND s.created_at >= ?'; vals.push(toMySqlDatetime(dateFrom)); }
        if (!req.user?.is_platform_super_admin && req.user?.tenant_id) {
          where += ' AND (m.tenant_id <=> ?)';
          vals.push(req.user.tenant_id);
        }
        const spins = await query(
          `SELECT s.*, m.phone_number, m.member_code, m.nickname
           FROM spins s LEFT JOIN members m ON m.id = s.member_id
           WHERE ${where} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
          [...vals, limit, offset]
        );
        const countRow = await queryOne<{ cnt: number }>(
          `SELECT COUNT(*) as cnt FROM spins s LEFT JOIN members m ON m.id = s.member_id WHERE ${where}`,
          vals
        );
        result = { success: true, spins, total: countRow?.cnt ?? 0 };
        break;
      }

      case 'admin_list_member_operation_logs': {
        if (!assertRpcEmployee(req)) {
          result = { success: false, error: 'FORBIDDEN', logs: [], total: 0 };
          break;
        }
        const limit = Math.min(parseInt(params.p_limit) || 100, 500);
        const offset = parseInt(params.p_offset) || 0;
        const search = String(params.p_search || '').trim();
        const actionFilter = String(params.p_action || '').trim();
        const dateFrom = String(params.p_date_from || '').trim();
        let where = '1=1';
        const vals: unknown[] = [];
        if (search) {
          where += ' AND (m.phone_number LIKE ? OR m.member_code LIKE ? OR m.nickname LIKE ? OR l.action LIKE ? OR l.detail LIKE ?)';
          vals.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
        }
        if (actionFilter) { where += ' AND l.action = ?'; vals.push(actionFilter); }
        if (dateFrom) { where += ' AND l.created_at >= ?'; vals.push(toMySqlDatetime(dateFrom)); }
        if (!req.user?.is_platform_super_admin && req.user?.tenant_id) {
          where += ' AND (l.tenant_id <=> ?)';
          vals.push(req.user.tenant_id);
        }
        const logs = await query(
          `SELECT l.*, m.phone_number, m.member_code, m.nickname
           FROM member_operation_logs l LEFT JOIN members m ON m.id = l.member_id
           WHERE ${where} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
          [...vals, limit, offset]
        );
        const countRow = await queryOne<{ cnt: number }>(
          `SELECT COUNT(*) as cnt FROM member_operation_logs l LEFT JOIN members m ON m.id = l.member_id WHERE ${where}`,
          vals
        );
        result = { success: true, logs, total: countRow?.cnt ?? 0 };
        break;
      }

      case 'admin_list_member_login_logs': {
        if (!assertRpcEmployee(req)) {
          result = { success: false, error: 'FORBIDDEN', logs: [], total: 0 };
          break;
        }
        const limitMl = Math.min(parseInt(params.p_limit) || 100, 500);
        const offsetMl = parseInt(params.p_offset) || 0;
        const searchMl = String(params.p_search || '').trim();
        const dateFromMl = String(params.p_date_from || '').trim();
        let whereMl = '1=1';
        const valsMl: unknown[] = [];
        if (searchMl) {
          whereMl +=
            ' AND (m.phone_number LIKE ? OR m.member_code LIKE ? OR m.nickname LIKE ? OR CAST(l.member_id AS CHAR) LIKE ?)';
          const like = `%${searchMl}%`;
          valsMl.push(like, like, like, like);
        }
        if (dateFromMl) {
          whereMl += ' AND l.login_at >= ?';
          valsMl.push(toMySqlDatetime(dateFromMl));
        }
        if (!req.user?.is_platform_super_admin && req.user?.tenant_id) {
          whereMl += ' AND (l.tenant_id <=> ?)';
          valsMl.push(req.user.tenant_id);
        }
        const logsMl = await query(
          `SELECT l.id, l.tenant_id, l.member_id, l.login_at,
                  m.phone_number, m.member_code, m.nickname
           FROM member_login_logs l
           LEFT JOIN members m ON m.id = l.member_id
           WHERE ${whereMl} ORDER BY l.login_at DESC LIMIT ? OFFSET ?`,
          [...valsMl, limitMl, offsetMl],
        );
        const countRowMl = await queryOne<{ cnt: number }>(
          `SELECT COUNT(*) as cnt FROM member_login_logs l
           LEFT JOIN members m ON m.id = l.member_id
           WHERE ${whereMl}`,
          valsMl,
        );
        result = { success: true, logs: logsMl, total: countRowMl?.cnt ?? 0 };
        break;
      }

      case 'admin_get_member_referrals': {
        if (!assertRpcEmployee(req)) {
          result = { success: false, error: 'FORBIDDEN', referrals: [] };
          break;
        }
        const memberId = params.p_member_id;
        if (!memberId) { result = { success: true, referrals: [] }; break; }
        const refMember = await queryOne<{ tenant_id: string | null }>(
          'SELECT tenant_id FROM members WHERE id = ? LIMIT 1',
          [memberId],
        );
        if (!refMember) {
          result = { success: true, referrals: [] };
          break;
        }
        if (
          !req.user?.is_platform_super_admin &&
          req.user?.tenant_id &&
          refMember.tenant_id !== req.user.tenant_id
        ) {
          result = { success: false, error: 'FORBIDDEN', referrals: [] };
          break;
        }
        let referrals = await query(
          `SELECT r.id, r.tenant_id, r.referrer_id, r.referee_id, r.created_at,
                  m.phone_number AS referee_phone, m.member_code AS referee_code, m.nickname AS referee_nickname, m.created_at AS referee_joined
           FROM referrals r
           JOIN members m ON m.id = r.referee_id
           WHERE r.referrer_id = ? AND r.tenant_id <=> ?
           ORDER BY r.created_at DESC`,
          [memberId, refMember.tenant_id],
        );
        if (!referrals.length) {
          referrals = await query(
            `SELECT r.*, m.phone_number as referee_phone, m.member_code as referee_code, m.nickname as referee_nickname, m.created_at as referee_joined
             FROM referral_relations r
             JOIN members m ON m.id = r.referee_id
             WHERE r.referrer_id = ?
             ORDER BY r.created_at DESC`,
            [memberId],
          );
        }
        result = { success: true, referrals };
        break;
      }

      // ---- 员工/管理相关 RPC ----
      case 'verify_employee_login_detailed': {
        if (!assertRpcEmployee(req)) {
          result = [{ error_code: 'FORBIDDEN' }];
          break;
        }
        // 密码验证（用于结算确认等场景）
        const bcrypt = await import('bcryptjs');
        const emp = await queryOne<{ password_hash: string }>(
          'SELECT password_hash FROM employees WHERE username = ?',
          [params.p_username]
        );
        if (!emp) {
          result = [{ error_code: 'USER_NOT_FOUND' }];
        } else {
          const match = await bcrypt.compare(params.p_password, emp.password_hash || '');
          result = match ? [{ verified: true }] : [{ error_code: 'WRONG_PASSWORD' }];
        }
        break;
      }

      case 'admin_set_member_initial_password': {
        if (!assertRpcEmployee(req)) {
          result = { success: false, error: 'FORBIDDEN' };
          break;
        }
        const isAdminRole = req.user?.role === 'admin' || !!req.user?.is_super_admin || !!req.user?.is_platform_super_admin;
        if (!isAdminRole) {
          result = { success: false, error: 'FORBIDDEN' };
          break;
        }
        const targetId = params.p_member_id != null ? String(params.p_member_id).trim() : '';
        if (!targetId) {
          result = { success: false, error: 'INVALID_PARAMS' };
          break;
        }
        const mRow = await queryOne<{ tenant_id: string | null }>(
          'SELECT tenant_id FROM members WHERE id = ? LIMIT 1',
          [targetId],
        );
        if (!mRow) {
          result = { success: false, error: 'NOT_FOUND' };
          break;
        }
        if (
          !req.user?.is_platform_super_admin &&
          req.user?.tenant_id &&
          mRow.tenant_id !== req.user.tenant_id
        ) {
          result = { success: false, error: 'FORBIDDEN' };
          break;
        }
        const bcrypt = await import('bcryptjs');
        const rawPwd = (params.p_new_password || params.p_password || '').trim();
        if (!rawPwd || rawPwd.length < 6) {
          result = { success: false, error: 'PASSWORD_TOO_SHORT' };
          break;
        }
        const hash = await bcrypt.hash(rawPwd, 10);
        // initial_password 与新建会员 / 会员自助改密一致：供后台「复制密码」；哈希不可反推明文
        await execute(
          'UPDATE members SET password_hash = ?, initial_password = ?, must_change_password = 1 WHERE id = ?',
          [hash, rawPwd, targetId],
        );
        result = { success: true };
        break;
      }

      case 'get_maintenance_mode_status': {
        try {
          const globalRow = await queryOne<{ enabled: number; message: string | null; allowed_roles: unknown }>(
            `SELECT enabled, message, allowed_roles FROM maintenance_mode WHERE id = 1 LIMIT 1`,
          );
          const globalEnabled = !!(globalRow?.enabled);
          let tenantEnabled = false;
          let tenantMessage: string | null = null;
          const scopeTid = tenantId ?? req.user?.tenant_id ?? null;
          if (scopeTid) {
            const tRow = await queryOne<{ enabled: number; message: string | null }>(
              `SELECT enabled, message FROM tenant_maintenance_modes WHERE tenant_id = ? LIMIT 1`,
              [scopeTid],
            );
            tenantEnabled = !!(tRow?.enabled);
            tenantMessage = tRow?.message ?? null;
          }
          const effectiveEnabled = globalEnabled || tenantEnabled;
          result = {
            globalEnabled,
            globalMessage: globalRow?.message ?? null,
            globalAllowedRoles: globalRow?.allowed_roles ?? [],
            tenantEnabled,
            tenantMessage,
            effectiveEnabled,
            scope: globalEnabled && tenantEnabled ? 'both' : globalEnabled ? 'global' : tenantEnabled ? 'tenant' : 'none',
          };
        } catch (e) {
          console.warn('[RPC] get_maintenance_mode_status:', (e as Error).message);
          result = { globalEnabled: false, tenantEnabled: false, effectiveEnabled: false, scope: 'none' };
        }
        break;
      }

      case 'set_maintenance_mode': {
        if (!assertRpcEmployee(req) || !req.user?.is_platform_super_admin) {
          result = { success: false, error: 'Forbidden' };
          break;
        }
        try {
          const scope = String(params.scope || 'global');
          const enabled = params.enabled ? 1 : 0;
          const message = String(params.message ?? '');
          const allowedRoles = params.allowed_roles ?? [];
          if (scope === 'global') {
            const exists = await queryOne<{ id: number }>('SELECT id FROM maintenance_mode WHERE id = 1');
            if (exists) {
              await execute(
                `UPDATE maintenance_mode SET enabled = ?, message = ?, allowed_roles = CAST(? AS JSON), updated_by = ? WHERE id = 1`,
                [enabled, message, JSON.stringify(allowedRoles), userId],
              );
            } else {
              await execute(
                `INSERT INTO maintenance_mode (id, enabled, message, allowed_roles, updated_by) VALUES (1, ?, ?, CAST(? AS JSON), ?)`,
                [enabled, message, JSON.stringify(allowedRoles), userId],
              );
            }
          } else {
            const tid = String(params.tenant_id || tenantId || '');
            if (!tid) { result = { success: false, error: 'tenant_id required' }; break; }
            const exists = await queryOne<{ id: string }>('SELECT id FROM tenant_maintenance_modes WHERE tenant_id = ?', [tid]);
            if (exists) {
              await execute(
                `UPDATE tenant_maintenance_modes SET enabled = ?, message = ?, allowed_roles = CAST(? AS JSON), updated_by = ? WHERE tenant_id = ?`,
                [enabled, message, JSON.stringify(allowedRoles), userId, tid],
              );
            } else {
              await execute(
                `INSERT INTO tenant_maintenance_modes (id, tenant_id, enabled, message, allowed_roles, updated_by) VALUES (UUID(), ?, ?, ?, CAST(? AS JSON), ?)`,
                [tid, enabled, message, JSON.stringify(allowedRoles), userId],
              );
            }
          }
          result = { success: true };
        } catch (e) {
          console.warn('[RPC] set_maintenance_mode:', (e as Error).message);
          result = { success: false, error: (e as Error).message };
        }
        break;
      }

      case 'list_tenant_maintenance_modes': {
        if (!assertRpcEmployee(req) || !req.user?.is_platform_super_admin) {
          result = [];
          break;
        }
        try {
          result = await query(
            `SELECT tmm.tenant_id, tmm.enabled, tmm.message, tmm.updated_at, t.tenant_name AS tenant_name
             FROM tenant_maintenance_modes tmm
             LEFT JOIN tenants t ON t.id = tmm.tenant_id
             ORDER BY tmm.updated_at DESC`,
          );
        } catch (e) {
          console.warn('[RPC] list_tenant_maintenance_modes:', (e as Error).message);
          result = [];
        }
        break;
      }

      case 'get_member_by_phone_for_my_tenant': {
        if (!assertRpcEmployee(req)) {
          result = null;
          break;
        }
        const phone = String(params.p_phone || '').trim();
        if (!phone) {
          result = null;
          break;
        }
        const scope = tenantId ?? req.user?.tenant_id;
        if (scope) {
          result = await queryOne(
            'SELECT * FROM members WHERE phone_number = ? AND tenant_id = ? LIMIT 1',
            [phone, scope],
          );
        } else if (req.user?.is_platform_super_admin) {
          result = await queryOne('SELECT * FROM members WHERE phone_number = ? LIMIT 1', [phone]);
        } else {
          result = null;
        }
        break;
      }

      case 'check_api_rate_limit': {
        try {
          const apiKeyId = String(params.api_key_id || '');
          if (!apiKeyId) { result = { allowed: true, remaining: 100 }; break; }
          const keyRow = await queryOne<{ rate_limit: number }>(
            `SELECT rate_limit FROM api_keys WHERE id = ? AND status = 'active' LIMIT 1`,
            [apiKeyId],
          );
          const rateLimit = keyRow?.rate_limit ?? 60;
          const windowStart = toMySqlDatetime(new Date(Date.now() - 60_000));
          const countRow = await queryOne<{ cnt: number }>(
            `SELECT COUNT(*) AS cnt FROM api_request_logs WHERE api_key_id = ? AND created_at >= ?`,
            [apiKeyId, windowStart],
          );
          const used = Number(countRow?.cnt) || 0;
          const remaining = Math.max(0, rateLimit - used);
          result = { allowed: remaining > 0, remaining, limit: rateLimit, used };
        } catch {
          result = { allowed: true, remaining: 100 };
        }
        break;
      }

      case 'get_tenant_feature_flag': {
        try {
          const flagKey = String(params.p_flag_key || params.flag_key || '');
          const flagTid = String(params.p_tenant_id || params.tenant_id || tenantId || '');
          if (!flagKey || !flagTid) { result = { enabled: true }; break; }
          const flagRow = await queryOne<{ enabled: number }>(
            `SELECT enabled FROM tenant_feature_flags WHERE tenant_id = ? AND flag_key = ? LIMIT 1`,
            [flagTid, flagKey],
          );
          result = { enabled: flagRow ? !!flagRow.enabled : true };
        } catch (e) {
          console.warn('[RPC] get_tenant_feature_flag:', (e as Error).message);
          result = { enabled: true };
        }
        break;
      }

      case 'set_tenant_feature_flag': {
        if (!assertRpcEmployee(req) || !req.user?.is_platform_super_admin) {
          result = { success: false, error: 'Forbidden' };
          break;
        }
        try {
          const flagKey = String(params.flag_key || '');
          const flagTid = String(params.tenant_id || '');
          const flagEnabled = params.enabled ? 1 : 0;
          if (!flagKey || !flagTid) { result = { success: false, error: 'flag_key and tenant_id required' }; break; }
          const existing = await queryOne<{ id: string }>(
            `SELECT id FROM tenant_feature_flags WHERE tenant_id = ? AND flag_key = ? LIMIT 1`,
            [flagTid, flagKey],
          );
          if (existing) {
            await execute(
              `UPDATE tenant_feature_flags SET enabled = ?, updated_by = ? WHERE id = ?`,
              [flagEnabled, userId, existing.id],
            );
          } else {
            await execute(
              `INSERT INTO tenant_feature_flags (id, tenant_id, flag_key, enabled, updated_by) VALUES (UUID(), ?, ?, ?, ?)`,
              [flagTid, flagKey, flagEnabled, userId],
            );
          }
          result = { success: true };
        } catch (e) {
          console.warn('[RPC] set_tenant_feature_flag:', (e as Error).message);
          result = { success: false, error: (e as Error).message };
        }
        break;
      }

      case 'list_tenant_feature_flags': {
        try {
          const flagTid = String(params.tenant_id || tenantId || '');
          if (!flagTid) { result = []; break; }
          result = await query(
            `SELECT id, flag_key, enabled, updated_by, updated_at FROM tenant_feature_flags WHERE tenant_id = ? ORDER BY flag_key`,
            [flagTid],
          );
        } catch (e) {
          console.warn('[RPC] list_tenant_feature_flags:', (e as Error).message);
          result = [];
        }
        break;
      }

      case 'get_login_2fa_settings': {
        try {
          const tfaTid = String(params.tenant_id || tenantId || '');
          if (!tfaTid) { result = { enabled: false, method: 'email' }; break; }
          const row = await queryOne<{ enabled: number; method: string }>(
            `SELECT enabled, method FROM login_2fa_settings WHERE tenant_id = ? LIMIT 1`,
            [tfaTid],
          );
          result = row ? { enabled: !!row.enabled, method: row.method } : { enabled: false, method: 'email' };
        } catch (e) {
          console.warn('[RPC] get_login_2fa_settings:', (e as Error).message);
          result = { enabled: false, method: 'email' };
        }
        break;
      }

      case 'set_login_2fa_settings': {
        if (!assertRpcEmployee(req) || !req.user?.is_platform_super_admin) {
          result = { success: false, error: 'Forbidden' };
          break;
        }
        try {
          const tfaTid = String(params.tenant_id || '');
          const tfaEnabled = params.enabled ? 1 : 0;
          const tfaMethod = String(params.method || 'email');
          if (!tfaTid) { result = { success: false, error: 'tenant_id required' }; break; }
          const existing = await queryOne<{ id: string }>(
            `SELECT id FROM login_2fa_settings WHERE tenant_id = ? LIMIT 1`, [tfaTid],
          );
          if (existing) {
            await execute(
              `UPDATE login_2fa_settings SET enabled = ?, method = ?, updated_by = ? WHERE tenant_id = ?`,
              [tfaEnabled, tfaMethod, userId, tfaTid],
            );
          } else {
            await execute(
              `INSERT INTO login_2fa_settings (id, tenant_id, enabled, method, updated_by) VALUES (UUID(), ?, ?, ?, ?)`,
              [tfaTid, tfaEnabled, tfaMethod, userId],
            );
          }
          result = { success: true };
        } catch (e) {
          console.warn('[RPC] set_login_2fa_settings:', (e as Error).message);
          result = { success: false, error: (e as Error).message };
        }
        break;
      }

      case 'generate_invitation_code': {
        if (req.user?.type === 'member' || !userId) {
          result = null;
          break;
        }
        const empGen = await queryOne<{ is_super_admin: number; role: string; tenant_id: string | null }>(
          `SELECT is_super_admin, role, tenant_id FROM employees WHERE id = ? AND (status = 'active' OR status IS NULL)`,
          [userId],
        );
        if (!empGen) {
          result = null;
          break;
        }
        const isPlatformSuper = !!(req.user as { is_platform_super_admin?: boolean })?.is_platform_super_admin;
        // 平台超管 + 租户管理员/租户超管均可生成；邀请码写入当前员工所属租户
        const canGenerate =
          isPlatformSuper ||
          (empGen.tenant_id != null &&
            (!!empGen.is_super_admin || empGen.role === 'admin'));
        if (!canGenerate) {
          result = null;
          break;
        }
        const maxUses = Math.max(0, Number(params.p_max_uses ?? 1));
        const creatorId = params.p_creator_id ? String(params.p_creator_id) : userId;
        let expiresAt: string | null = params.p_expires_at ? String(params.p_expires_at) : null;
        if (expiresAt && !Number.isNaN(Date.parse(expiresAt))) {
          expiresAt = toMySqlDatetime(expiresAt) as string;
        } else {
          expiresAt = null;
        }
        let codeStr = '';
        for (let attempt = 0; attempt < 50; attempt++) {
          codeStr = createHash('md5')
            .update(randomBytes(16))
            .digest('hex')
            .slice(0, 8)
            .toUpperCase();
          const dup = await queryOne('SELECT id FROM invitation_codes WHERE code = ? LIMIT 1', [codeStr]);
          if (!dup) break;
        }
        const newId = randomUUID();
        const tenantId = empGen.tenant_id ? String(empGen.tenant_id) : null;
        await execute(
          `INSERT INTO invitation_codes (id, code, member_id, max_uses, used_count, is_active, expires_at, created_by, status, tenant_id)
           VALUES (?, ?, NULL, ?, 0, 1, ?, ?, 'active', ?)`,
          [newId, codeStr, maxUses, expiresAt, creatorId, tenantId],
        );
        result = codeStr;
        break;
      }

      case 'publish_system_announcement': {
        if (req.user?.type === 'member' || !userId) {
          result = { success: false, message: 'NO_PERMISSION', announcement_id: null, recipient_count: 0 };
          break;
        }
        const empPub = await queryOne<{ is_super_admin: number }>(
          `SELECT is_super_admin FROM employees WHERE id = ? AND (status = 'active' OR status IS NULL)`,
          [userId],
        );
        const canPublishAnnounce =
          !!empPub?.is_super_admin || !!(req.user as { is_platform_super_admin?: boolean })?.is_platform_super_admin;
        if (!empPub || !canPublishAnnounce) {
          result = { success: false, message: 'NO_PERMISSION', announcement_id: null, recipient_count: 0 };
          break;
        }
        const scopeRaw = String(params.p_scope ?? '').trim().toLowerCase();
        const vType = String(params.p_type ?? 'info').trim().toLowerCase();
        const annType = ['info', 'warning', 'success', 'error'].includes(vType) ? vType : 'info';
        const vTitle = String(params.p_title ?? '').trim();
        const vMessage = String(params.p_message ?? '').trim();
        const pTenant = params.p_tenant_id ? String(params.p_tenant_id) : null;
        const vLink = String(params.p_link ?? '').trim() || null;

        if (scopeRaw !== 'global' && scopeRaw !== 'tenant') {
          result = { success: false, message: 'INVALID_SCOPE', announcement_id: null, recipient_count: 0 };
          break;
        }
        if (scopeRaw === 'tenant' && !pTenant) {
          result = { success: false, message: 'TENANT_REQUIRED', announcement_id: null, recipient_count: 0 };
          break;
        }
        if (!vTitle || !vMessage) {
          result = { success: false, message: 'TITLE_AND_MESSAGE_REQUIRED', announcement_id: null, recipient_count: 0 };
          break;
        }

        const annId = randomUUID();
        await execute(
          `INSERT INTO system_announcements (id, scope, tenant_id, title, message, type, link, created_by, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3))`,
          [
            annId,
            scopeRaw,
            scopeRaw === 'tenant' ? pTenant : null,
            vTitle,
            vMessage,
            annType,
            vLink,
            userId,
          ],
        );

        const metaObj =
          scopeRaw === 'global'
            ? { announcement_id: annId, scope: scopeRaw }
            : { announcement_id: annId, scope: scopeRaw, tenant_id: pTenant };
        const metaJson = JSON.stringify(metaObj);

        /** 同一租户下若存在重复的 employees 行（相同 username），原先会插入多条，登录用户会收到多条相同通知。按 username 分组取 MIN(id)，每人一条。 */
        let insertSql: string;
        let insertParams: unknown[];
        if (scopeRaw === 'global') {
          insertSql = `INSERT INTO notifications (id, user_id, title, content, type, category, link, metadata, is_read, created_at)
            SELECT UUID(), u.id, ?, ?, ?, 'announcement', ?, CAST(? AS JSON), 0, NOW(3)
            FROM (
              SELECT MIN(e.id) AS id
              FROM employees e
              WHERE (e.status = 'active' OR e.status IS NULL)
              GROUP BY COALESCE(NULLIF(TRIM(e.username), ''), e.id)
            ) u`;
          insertParams = [vTitle, vMessage, annType, vLink, metaJson];
        } else {
          insertSql = `INSERT INTO notifications (id, user_id, title, content, type, category, link, metadata, is_read, created_at)
            SELECT UUID(), u.id, ?, ?, ?, 'announcement', ?, CAST(? AS JSON), 0, NOW(3)
            FROM (
              SELECT MIN(e.id) AS id
              FROM employees e
              WHERE (e.status = 'active' OR e.status IS NULL) AND e.tenant_id = ?
              GROUP BY COALESCE(NULLIF(TRIM(e.username), ''), e.id)
            ) u`;
          insertParams = [vTitle, vMessage, annType, vLink, metaJson, pTenant];
        }

        const ins = await execute(insertSql, insertParams);
        const recipientCount = typeof (ins as { affectedRows?: number })?.affectedRows === 'number'
          ? (ins as { affectedRows: number }).affectedRows
          : 0;

        result = {
          success: true,
          message: 'OK',
          announcement_id: annId,
          recipient_count: recipientCount,
        };
        break;
      }

      case 'list_system_announcements': {
        if (req.user?.type === 'member' || !userId) {
          result = [];
          break;
        }
        const empList = await queryOne<{ is_super_admin: number }>(
          `SELECT is_super_admin FROM employees WHERE id = ? AND (status = 'active' OR status IS NULL)`,
          [userId],
        );
        const canListAnnounce =
          !!empList?.is_super_admin || !!(req.user as { is_platform_super_admin?: boolean })?.is_platform_super_admin;
        if (!empList || !canListAnnounce) {
          result = [];
          break;
        }
        const lim = Math.min(200, Math.max(1, Number(params.p_limit ?? 50)));
        const rows = await query<Record<string, unknown>>(
          `SELECT id, scope, tenant_id, title, message, type, link, created_by, created_at
           FROM system_announcements ORDER BY created_at DESC LIMIT ?`,
          [lim],
        );
        result = rows.map((r) => ({
          ...r,
          created_at:
            r.created_at instanceof Date
              ? r.created_at.toISOString()
              : r.created_at != null
                ? String(r.created_at)
                : null,
        }));
        break;
      }

      case 'mark_all_notifications_read': {
        if (req.user?.type === 'member' || !userId) {
          res.status(403).json({ data: null, error: { message: 'Forbidden' } });
          return;
        }
        const hdr = await execute(
          'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND (is_read = 0 OR is_read IS NULL)',
          [userId],
        );
        result = { success: true, updated: (hdr as ResultSetHeader).affectedRows ?? 0 };
        break;
      }

      case 'sync_activity_reward_tiers': {
        if (req.user?.type === 'member' || !userId) {
          res.status(403).json({ data: null, error: { message: 'Forbidden' } });
          return;
        }
        const tiers = params.tiers;
        if (!Array.isArray(tiers)) {
          result = { success: false, error: 'tiers must be an array' };
          break;
        }
        await withTransaction(async (conn) => {
          await conn.query('DELETE FROM activity_reward_tiers');
          for (let i = 0; i < tiers.length; i++) {
            const t = tiers[i] as Record<string, unknown>;
            const minPoints = Math.floor(Number(t.min_points ?? t.minPoints ?? 0));
            const maxRaw = t.max_points ?? t.maxPoints;
            const maxPoints =
              maxRaw === null || maxRaw === undefined || maxRaw === ''
                ? null
                : Math.floor(Number(maxRaw));
            const rewardNgn = Number(t.reward_amount_ngn ?? t.rewardAmountNGN ?? 0);
            const rewardGhs = Number(t.reward_amount_ghs ?? t.rewardAmountGHS ?? 0);
            const rewardUsdt = Number(t.reward_amount_usdt ?? t.rewardAmountUSDT ?? 0);
            const sortOrder = Math.floor(Number(t.sort_order ?? t.sortOrder ?? i));
            await conn.query(
              `INSERT INTO activity_reward_tiers (id, min_points, max_points, reward_amount_ngn, reward_amount_ghs, reward_amount_usdt, sort_order)
               VALUES (UUID(), ?, ?, ?, ?, ?, ?)`,
              [minPoints, maxPoints, rewardNgn, rewardGhs, rewardUsdt, sortOrder],
            );
          }
        });
        result = { success: true, count: tiers.length };
        break;
      }

      case 'sync_card_types': {
        if (req.user?.type === 'member' || !userId) {
          res.status(403).json({ data: null, error: { message: 'Forbidden' } });
          return;
        }
        const typesRaw = params.types;
        if (!Array.isArray(typesRaw)) {
          result = { success: false, error: 'types must be an array' };
          break;
        }
        const names = typesRaw.map((x) => String(x).trim()).filter(Boolean);
        await withTransaction(async (conn) => {
          await conn.query('DELETE FROM card_types');
          for (let i = 0; i < names.length; i++) {
            await conn.query(
              'INSERT INTO card_types (id, name, sort_order) VALUES (UUID(), ?, ?)',
              [names[i], i],
            );
          }
        });
        result = { success: true, count: names.length };
        break;
      }

      case 'get_api_daily_stats': {
        const u = req.user;
        if (!u || u.type === 'member' || !userId) {
          result = [];
          break;
        }
        const canViewApiStats =
          u.type === 'employee' &&
          (u.role === 'admin' || !!u.is_super_admin || !!u.is_platform_super_admin);
        if (!canViewApiStats) {
          result = [];
          break;
        }
        const days = Math.min(365, Math.max(1, Number(params.p_days ?? params.days ?? 7)));
        try {
          const rows = await query<{
            stat_date: string | Date;
            total_requests: number | string;
            successful_requests: number | string;
            failed_requests: number | string;
            avg_response_time: number | string | null;
          }>(
            `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS stat_date,
                    COUNT(*) AS total_requests,
                    SUM(CASE WHEN response_status >= 200 AND response_status < 400 THEN 1 ELSE 0 END) AS successful_requests,
                    SUM(CASE WHEN response_status IS NULL OR response_status < 200 OR response_status >= 400 THEN 1 ELSE 0 END) AS failed_requests,
                    AVG(COALESCE(response_time_ms, 0)) AS avg_response_time
             FROM api_request_logs
             WHERE created_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)
             GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
             ORDER BY stat_date ASC`,
            [days],
          );
          result = rows.map((r) => {
            const total = Number(r.total_requests) || 0;
            const failed = Number(r.failed_requests) || 0;
            return {
              stat_date:
                r.stat_date instanceof Date
                  ? (toMySqlDatetime(r.stat_date) as string).slice(0, 10)
                  : String(r.stat_date).slice(0, 10),
              total_requests: total,
              successful_requests: Number(r.successful_requests) || 0,
              failed_requests: failed,
              error_rate: total > 0 ? failed / total : 0,
              avg_response_time: Math.round(Number(r.avg_response_time) || 0),
            };
          });
        } catch (e) {
          console.warn('[RPC] get_api_daily_stats:', (e as Error).message);
          result = [];
        }
        break;
      }

      case 'get_api_endpoint_stats': {
        const uEp = req.user;
        if (!uEp || uEp.type === 'member' || !userId) {
          result = [];
          break;
        }
        const canViewEp =
          uEp.type === 'employee' &&
          (uEp.role === 'admin' || !!uEp.is_super_admin || !!uEp.is_platform_super_admin);
        if (!canViewEp) {
          result = [];
          break;
        }
        const daysEp = Math.min(365, Math.max(1, Number(params.p_days ?? params.days ?? 7)));
        try {
          const rows = await query<{
            endpoint: string | null;
            total_requests: number | string;
            successful_requests: number | string;
            failed_requests: number | string;
            avg_response_time: number | string | null;
          }>(
            `SELECT COALESCE(NULLIF(TRIM(endpoint), ''), '(unknown)') AS endpoint,
                    COUNT(*) AS total_requests,
                    SUM(CASE WHEN response_status >= 200 AND response_status < 400 THEN 1 ELSE 0 END) AS successful_requests,
                    SUM(CASE WHEN response_status IS NULL OR response_status < 200 OR response_status >= 400 THEN 1 ELSE 0 END) AS failed_requests,
                    AVG(COALESCE(response_time_ms, 0)) AS avg_response_time
             FROM api_request_logs
             WHERE created_at >= DATE_SUB(NOW(3), INTERVAL ? DAY)
             GROUP BY COALESCE(NULLIF(TRIM(endpoint), ''), '(unknown)')
             ORDER BY total_requests DESC
             LIMIT 200`,
            [daysEp],
          );
          result = rows.map((r) => ({
            endpoint: String(r.endpoint ?? '(unknown)'),
            total_requests: Number(r.total_requests) || 0,
            successful_requests: Number(r.successful_requests) || 0,
            failed_requests: Number(r.failed_requests) || 0,
            avg_response_time: Math.round(Number(r.avg_response_time) || 0),
          }));
        } catch (e) {
          console.warn('[RPC] get_api_endpoint_stats:', (e as Error).message);
          result = [];
        }
        break;
      }

      case 'webhook_processor': {
        result = await runWebhookProcessorRpc(req, params);
        break;
      }

      case 'archive_old_data': {
        if (req.user?.type === 'member' || !userId) {
          res.status(403).json({ data: null, error: { message: 'Forbidden' } });
          return;
        }
        const empArch = await queryOne<{ role: string; is_super_admin: number | null }>(
          `SELECT role, is_super_admin FROM employees WHERE id = ? AND (status = 'active' OR status IS NULL)`,
          [userId],
        );
        const canArchive =
          !!empArch && (empArch.role === 'admin' || !!empArch.is_super_admin);
        if (!canArchive) {
          res.status(403).json({ data: null, error: { message: 'Admin only' } });
          return;
        }
        const retentionDays = Math.min(3650, Math.max(1, Number(params.retention_days ?? params.p_retention_days ?? 90)));

        result = await withTransaction(async (conn) => {
          const [cutoffRows] = await conn.query(
            'SELECT DATE_SUB(NOW(3), INTERVAL ? DAY) AS c',
            [retentionDays],
          );
          const cutoffCell = (cutoffRows as { c: Date | string }[])[0]?.c;
          const cutoff_date =
            cutoffCell instanceof Date ? cutoffCell.toISOString() : String(cutoffCell ?? '');

          const orderWhere = `o.created_at < DATE_SUB(NOW(3), INTERVAL ? DAY)
            AND (o.status IN ('completed','cancelled') OR o.is_deleted = 1)`;

          const [ordIns] = await conn.query(
            `INSERT INTO archived_orders (
              id, original_id, order_number, order_type, phone_number, currency, amount, actual_payment,
              exchange_rate, fee, profit_ngn, profit_usdt, status, created_at, completed_at, archived_at, original_data
            )
            SELECT UUID(), o.id, o.order_number, COALESCE(NULLIF(TRIM(o.card_type), ''), 'order'), o.phone_number, o.currency,
              COALESCE(o.amount, 0), o.actual_payment, o.rate, o.fee, o.profit_ngn, o.profit_usdt, o.status, o.created_at,
              o.updated_at, NOW(3),
              JSON_OBJECT(
                'id', o.id, 'order_number', o.order_number, 'member_id', o.member_id, 'tenant_id', o.tenant_id,
                'status', o.status, 'amount', o.amount, 'currency', o.currency, 'created_at', o.created_at,
                'is_deleted', o.is_deleted, 'phone_number', o.phone_number, 'profit_ngn', o.profit_ngn, 'profit_usdt', o.profit_usdt
              )
            FROM orders o WHERE ${orderWhere}`,
            [retentionDays],
          );
          const ordersCount = (ordIns as ResultSetHeader).affectedRows ?? 0;
          if (ordersCount > 0) {
            try {
              await conn.query(
                `DELETE ml FROM meika_zone_order_links ml INNER JOIN orders o ON o.id = ml.order_id WHERE ${orderWhere}`,
                [retentionDays],
              );
            } catch { /* table may not exist yet */ }
            await conn.query(
              `DELETE o FROM orders o WHERE ${orderWhere}`,
              [retentionDays],
            );
          }

          const [logIns] = await conn.query(
            `INSERT INTO archived_operation_logs (
              id, original_id, module, operation_type, operator_account, operator_role, timestamp, archived_at, original_data
            )
            SELECT UUID(), l.id, COALESCE(l.module, ''), COALESCE(l.operation_type, ''), COALESCE(l.operator_account, ''),
              COALESCE(l.operator_role, ''), l.timestamp, NOW(3),
              JSON_OBJECT(
                'id', l.id, 'module', l.module, 'operation_type', l.operation_type, 'timestamp', l.timestamp,
                'operator_id', l.operator_id, 'object_id', l.object_id
              )
            FROM operation_logs l WHERE l.timestamp < DATE_SUB(NOW(3), INTERVAL ? DAY)`,
            [retentionDays],
          );
          const logsCount = (logIns as ResultSetHeader).affectedRows ?? 0;
          if (logsCount > 0) {
            await conn.query('DELETE FROM operation_logs WHERE timestamp < DATE_SUB(NOW(3), INTERVAL ? DAY)', [
              retentionDays,
            ]);
          }

          const [ptIns] = await conn.query(
            `INSERT INTO archived_points_ledger (
              id, original_id, phone_number, member_code, points_earned, transaction_type, created_at, archived_at, original_data
            )
            SELECT UUID(), p.id, p.phone_number, p.member_code,
              COALESCE(p.points_earned, p.amount, 0),
              COALESCE(NULLIF(TRIM(p.transaction_type), ''), NULLIF(TRIM(p.type), ''), ''),
              p.created_at, NOW(3),
              JSON_OBJECT(
                'id', p.id, 'member_id', p.member_id, 'account_id', p.account_id, 'amount', p.amount,
                'type', p.type, 'created_at', p.created_at, 'order_id', p.order_id
              )
            FROM points_ledger p WHERE p.created_at < DATE_SUB(NOW(3), INTERVAL ? DAY)`,
            [retentionDays],
          );
          const pointsCount = (ptIns as ResultSetHeader).affectedRows ?? 0;
          if (pointsCount > 0) {
            await conn.query('DELETE FROM points_ledger WHERE created_at < DATE_SUB(NOW(3), INTERVAL ? DAY)', [
              retentionDays,
            ]);
          }

          const summary = {
            orders_archived: ordersCount,
            operation_logs_archived: logsCount,
            points_ledger_archived: pointsCount,
            cutoff_date,
          };
          const runId = randomUUID();
          await conn.query(
            `INSERT INTO archive_runs (id, tables_processed, records_archived, records_deleted, triggered_by, status)
             VALUES (?, CAST(? AS JSON), CAST(? AS JSON), CAST(? AS JSON), 'function', 'completed')`,
            [
              runId,
              JSON.stringify(['orders', 'operation_logs', 'points_ledger']),
              JSON.stringify(summary),
              '{}',
            ],
          );
          return summary;
        });
        break;
      }

      // ---- 租户数据迁移（MySQL：预检/导出/冲突/执行/任务列表；回滚仅标记任务）----
      case 'preview_tenant_data_migration':
      case 'export_tenant_data_json':
      case 'get_tenant_migration_conflict_details':
      case 'execute_tenant_data_migration':
      case 'rollback_tenant_migration_job':
      case 'verify_tenant_migration_job':
      case 'export_tenant_migration_audit_bundle':
      case 'list_tenant_migration_jobs':
      case 'list_tenant_migration_jobs_v2': {
        result = await runTenantMigrationRpc(fn, req, params);
        break;
      }

      // ---- 默认：尝试直接查询同名表或返回空 ----
      default: {
        console.warn(`[RPC Proxy] Unknown RPC: ${fnName}, returning empty result`);
        result = null;
        break;
      }
    }

    res.json({ data: result, error: null });
  } catch (e) {
    console.error(`[RPC Proxy] ${fnName} error:`, e);
    res.status(500).json({ data: null, error: { message: (e as Error).message } });
  }
}
