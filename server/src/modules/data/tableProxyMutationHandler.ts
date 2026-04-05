/**
 * 通用表代理 — INSERT / UPDATE / DELETE
 * 自 tableProxy 拆分；行为与原实现一致
 */
import type { Request, Response } from 'express';
import type { ResultSetHeader } from 'mysql2';
import { logger } from '../../lib/logger.js';
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

  // ── C1: 禁止表代理直接 INSERT 关键审计表 ──
  // 管理员 upsert（备份恢复 / 数据导入）放行，普通 INSERT 一律拦截
  const INSERT_BLOCKED_TABLES = new Set(['spin_credits', 'points_ledger']);
  if (INSERT_BLOCKED_TABLES.has(table)) {
    const isAdminUpsert = (upsert && onConflict) && isAdminUser(req);
    if (!isAdminUpsert) {
      rejectTableAccess(res, table, `Table '${table}' can only be written through dedicated service APIs`);
      return;
    }
  }

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

      // C3: Only increment member_activity for orders inserted as 'completed'
      if (table === 'orders' && inserted && typeof inserted === 'object') {
        const ins = inserted as Record<string, unknown>;
        const st = String(ins.status ?? '').toLowerCase().trim();
        if (st === 'completed' && ins.id) {
          try {
            await incrementMemberActivityForNewOrder(ins);
          } catch (actErr) {
            logger.error('TableProxy', 'INSERT orders incrementMemberActivity:', actErr);
          }
          const memberId = ins.member_id != null ? String(ins.member_id).trim() : '';
          const tenantId = ins.tenant_id != null ? String(ins.tenant_id).trim() : '';
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
              logger.error('TableProxy', 'INSERT orders completed spin:', spinErr);
            }
          }
        }
      }
    }

    res.json({ data: results.length === 1 ? results[0] : results, error: null });
  } catch (e) {
    logger.error('TableProxy', `INSERT ${table} error:`, e);
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

    // ── C1: 敏感表列级写入保护 ──
    // 关键余额/次数列只能通过专用 service 修改，禁止表代理直接 PATCH
    const BLOCKED_PATCH_COLUMNS: Record<string, Set<string>> = {
      points_accounts: new Set(['frozen_points', 'total_earned', 'total_spent']),
      member_activity: new Set(['lottery_spin_balance', 'lottery_free_draws_used', 'lottery_quota_day']),
    };
    const blocked = BLOCKED_PATCH_COLUMNS[table];
    if (blocked) {
      const violating = Object.keys(mappedData).filter(k => blocked.has(k));
      if (violating.length > 0) {
        logger.warn('TableProxy', `PATCH ${table}: blocked columns ${violating.join(', ')} stripped`);
        mappedData = Object.fromEntries(Object.entries(mappedData).filter(([k]) => !blocked.has(k)));
        if (Object.keys(mappedData).length === 0) {
          res.status(400).json({ data: null, error: { message: `All requested columns are protected on ${table}` } });
          return;
        }
      }
    }

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
            logger.error('TableProxy', 'UPDATE orders incrementMemberActivity:', actErr);
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
              logger.error('TableProxy', 'order completed spin:', spinErr);
            }
          }
        } else if (prev === 'completed' && newStatus !== 'completed') {
          try {
            await reverseActivityDataForOrder(String(row.id));
          } catch (revErr) {
            logger.error('TableProxy', 'UPDATE orders reverseActivityData:', revErr);
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
          catch (revErr) { logger.error('TableProxy', 'DELETE orders reverseActivityData:', revErr); }
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
    logger.error('TableProxy', `DELETE ${table} error:`, e);
    res.status(500).json({ data: null, error: { message: (e as Error).message } });
  }
}
