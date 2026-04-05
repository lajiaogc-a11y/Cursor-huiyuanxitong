/**
 * RPC handlers (extracted from tableProxy)
 */
import { queryOne, getPool, withTransaction } from '../../database/index.js';
import { assertRpcEmployee } from './tableConfig.js';

import { addPoints, syncPointsLog } from '../points/pointsService.js';
import { insertOperationLogRepository } from './repository.js';
import { randomUUID } from 'crypto';

import type { RpcCtx, RpcDispatchResult } from './rpcProxyTypes.js';

export async function handleRpcStaffMallProcessGroup(ctx: RpcCtx): Promise<RpcDispatchResult> {
  const { fn, fnName, req, res, params, tenantId, userId, isAdmin } = ctx;
  let result: unknown;

  switch (fn) {
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
      const action = params.p_action != null ? String(params.p_action) : '';
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
              // C3: sync remaining_points after cancel refund
              await conn.query(
                'UPDATE member_activity SET remaining_points = ?, updated_at = NOW(3) WHERE member_id = ?',
                [Math.max(0, afterBal), String(red.member_id)],
              );
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
              const [rejectBalRows] = await conn.query('SELECT COALESCE(balance,0) AS b FROM points_accounts WHERE id = ?', [acct.id]);
              const afterBal = Number((rejectBalRows as { b?: unknown }[])[0]?.b ?? 0);
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
              // C3: sync remaining_points after reject refund
              await conn.query(
                'UPDATE member_activity SET remaining_points = ?, updated_at = NOW(3) WHERE member_id = ?',
                [Math.max(0, afterBal), String(red.member_id)],
              );
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
    default:
      return null;
  }
  return { result };
}
