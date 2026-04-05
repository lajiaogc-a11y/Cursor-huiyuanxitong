/**
 * RPC handlers (extracted from tableProxy)
 */
import { logger } from '../../lib/logger.js';
import { query, queryOne, execute } from '../../database/index.js';
import { assertRpcEmployee, toMySqlDatetime } from './tableConfig.js';

import type { RpcCtx, RpcDispatchResult } from './rpcProxyTypes.js';

export async function handleRpcEmployeeMaintenanceGroup(ctx: RpcCtx): Promise<RpcDispatchResult> {
  const { fn, fnName, req, res, params, tenantId, userId, isAdmin } = ctx;
  let result: unknown;

  switch (fn) {
    // ---- 员工/管理相关 RPC ----
    case 'verify_employee_login_detailed': {
      if (!assertRpcEmployee(req)) {
        result = [{ error_code: 'FORBIDDEN' }];
        break;
      }
      // C1 fix: restrict to self-only — caller can only verify their own password
      const callerUsername = (req.user as Record<string, unknown>)?.username;
      if (!callerUsername || String(params.p_username) !== String(callerUsername)) {
        result = [{ error_code: 'FORBIDDEN' }];
        break;
      }
      const bcrypt = await import('bcryptjs');
      const emp = await queryOne<{ password_hash: string; tenant_id: string | null }>(
        'SELECT password_hash, tenant_id FROM employees WHERE username = ? AND tenant_id <=> ?',
        [params.p_username, tenantId ?? null]
      );
      if (!emp) {
        result = [{ error_code: 'USER_NOT_FOUND' }];
      } else {
        const match = await bcrypt.compare(String(params.p_password ?? ''), emp.password_hash || '');
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
      const rawPwd = String(params.p_new_password ?? params.p_password ?? '').trim();
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
        logger.warn('RPC', 'get_maintenance_mode_status:', (e as Error).message);
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
        logger.warn('RPC', 'set_maintenance_mode:', (e as Error).message);
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
        logger.warn('RPC', 'list_tenant_maintenance_modes:', (e as Error).message);
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
        // H3 fix: non-platform users can only read their own tenant's flags
        const reqTid = String(params.p_tenant_id || params.tenant_id || tenantId || '');
        const callerTid = req.user?.tenant_id;
        const flagTid = req.user?.is_platform_super_admin ? reqTid : (callerTid ? String(callerTid) : reqTid);
        if (!flagKey || !flagTid) { result = { enabled: true }; break; }
        const flagRow = await queryOne<{ enabled: number }>(
          `SELECT enabled FROM tenant_feature_flags WHERE tenant_id = ? AND flag_key = ? LIMIT 1`,
          [flagTid, flagKey],
        );
        result = { enabled: flagRow ? !!flagRow.enabled : true };
      } catch (e) {
        logger.warn('RPC', 'get_tenant_feature_flag:', (e as Error).message);
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
        logger.warn('RPC', 'set_tenant_feature_flag:', (e as Error).message);
        result = { success: false, error: (e as Error).message };
      }
      break;
    }

    case 'list_tenant_feature_flags': {
      try {
        // H3 fix: non-platform users can only list their own tenant's flags
        const reqTid = String(params.tenant_id || tenantId || '');
        const callerTid = req.user?.tenant_id;
        const flagTid = req.user?.is_platform_super_admin ? reqTid : (callerTid ? String(callerTid) : reqTid);
        if (!flagTid) { result = []; break; }
        result = await query(
          `SELECT id, flag_key, enabled, updated_by, updated_at FROM tenant_feature_flags WHERE tenant_id = ? ORDER BY flag_key`,
          [flagTid],
        );
      } catch (e) {
        logger.warn('RPC', 'list_tenant_feature_flags:', (e as Error).message);
        result = [];
      }
      break;
    }

    case 'get_login_2fa_settings': {
      try {
        // H3 fix: non-platform users can only read their own tenant's 2FA settings
        const reqTid = String(params.tenant_id || tenantId || '');
        const callerTid = req.user?.tenant_id;
        const tfaTid = req.user?.is_platform_super_admin ? reqTid : (callerTid ? String(callerTid) : reqTid);
        if (!tfaTid) { result = { enabled: false, method: 'email' }; break; }
        const row = await queryOne<{ enabled: number; method: string }>(
          `SELECT enabled, method FROM login_2fa_settings WHERE tenant_id = ? LIMIT 1`,
          [tfaTid],
        );
        result = row ? { enabled: !!row.enabled, method: row.method } : { enabled: false, method: 'email' };
      } catch (e) {
        logger.warn('RPC', 'get_login_2fa_settings:', (e as Error).message);
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
        logger.warn('RPC', 'set_login_2fa_settings:', (e as Error).message);
        result = { success: false, error: (e as Error).message };
      }
      break;
    }

    default:
      return null;
  }
  return { result };
}
