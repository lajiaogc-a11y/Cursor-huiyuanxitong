/**
 * 活动数据类列表（签到流水、抽奖积分流水等）的租户解析：
 * - 平台总管理：必须显式传 query.tenant_id，否则 400（避免误扫全库或落到错误租户）。
 * - 普通员工：仅允许本 JWT 租户；若传 tenant_id 必须与 JWT 一致，否则 403。
 *
 * 平台管理员判定与登录 / getMe 一致：除 JWT.is_platform_super_admin 外，
 * 平台租户(tenant_id=config.platformTenantId) 且 (is_super_admin 或 role=admin/manager) 也视为可跨租户查询，
 * 避免旧 token 或缺少标志位时切换「查看租户」导致 403。
 */
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { config } from '../../config/index.js';

export type ResolveTenantResult =
  | { ok: true; tenantId: string }
  | { ok: false; status: number; body: Record<string, unknown> };

function isPlatformCrossTenantAdmin(req: AuthenticatedRequest): boolean {
  if (req.user?.is_platform_super_admin) return true;
  if (req.user?.type !== 'employee') return false;
  const tid = (req.user.tenant_id != null ? String(req.user.tenant_id).trim() : '') || '';
  if (!tid || tid !== config.platformTenantId) return false;
  const role = String(req.user.role ?? '').toLowerCase();
  return !!(req.user.is_super_admin || role === 'admin' || role === 'manager');
}

export function resolveTenantIdForActivityDataList(req: AuthenticatedRequest): ResolveTenantResult {
  const qRaw = typeof req.query.tenant_id === 'string' ? req.query.tenant_id.trim() : '';
  const jwtTenant = (req.user?.tenant_id != null ? String(req.user.tenant_id).trim() : '') || '';

  if (isPlatformCrossTenantAdmin(req)) {
    if (!qRaw) {
      return {
        ok: false,
        status: 400,
        body: {
          success: false,
          error: {
            code: 'TENANT_ID_REQUIRED',
            message: 'tenant_id is required when querying activity data as platform admin',
          },
        },
      };
    }
    return { ok: true, tenantId: qRaw };
  }

  if (!jwtTenant) {
    return {
      ok: false,
      status: 400,
      body: {
        success: false,
        error: {
          code: 'TENANT_NOT_BOUND',
          message: 'Account not bound to a tenant, cannot query activity data',
        },
      },
    };
  }

  if (qRaw && qRaw !== jwtTenant) {
    return {
      ok: false,
      status: 403,
      body: {
        success: false,
        error: {
          code: 'TENANT_SCOPE_FORBIDDEN',
          message: 'No permission to query check-in or spin credit data for other tenants',
        },
      },
    };
  }

  return { ok: true, tenantId: jwtTenant };
}
