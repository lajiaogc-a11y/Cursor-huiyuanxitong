/**
 * RPC handlers (extracted from tableProxy)
 */
import type { Response } from 'express';
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

import type { RpcCtx, RpcDispatchResult } from './rpcProxyTypes.js';

export async function handleRpcWebhookArchiveMigrationGroup(ctx: RpcCtx): Promise<RpcDispatchResult> {
  const { fn, fnName, req, res, params, tenantId, userId, isAdmin } = ctx;
  let result: unknown;

  switch (fn) {

    case 'webhook_processor': {
      result = await runWebhookProcessorRpc(req, params);
      break;
    }

    case 'archive_old_data': {
      if (req.user?.type === 'member' || !userId) {
        res.status(403).json({ data: null, error: { message: 'Forbidden' } });
        return { result: null, responseSent: true };
      }
      const empArch = await queryOne<{ role: string; is_super_admin: number | null }>(
        `SELECT role, is_super_admin FROM employees WHERE id = ? AND (status = 'active' OR status IS NULL)`,
        [userId],
      );
      const canArchive =
        !!empArch && (empArch.role === 'admin' || !!empArch.is_super_admin);
      if (!canArchive) {
        res.status(403).json({ data: null, error: { message: 'Admin only' } });
        return { result: null, responseSent: true };
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
    default:
      return null;
  }
  return { result };
}
