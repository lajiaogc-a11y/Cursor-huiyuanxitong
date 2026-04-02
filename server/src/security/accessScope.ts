/**
 * 统一租户 / 权限作用域
 * 从已认证的 req.user 解析，供 controller、tableProxy、service 等单一路径消费。
 */
import type { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

export type PrincipalType = 'employee' | 'member' | 'anonymous';

export type AccessScope = {
  /** 当前主体关联租户（会员/员工 JWT）；平台视角可能仍有 tenant_id */
  tenantId: string | null;
  /** 员工 id；会员请求为 null */
  employeeId: string | null;
  /** 会员 id；员工请求为 null */
  memberId: string | null;
  principalType: PrincipalType;
  /** JWT is_platform_super_admin：可跨租户表代理等 */
  isPlatformSuperAdmin: boolean;
  /** JWT is_super_admin：租户级超管 */
  isTenantSuperAdmin: boolean;
};

type JwtUserLike = {
  id?: string;
  tenant_id?: string;
  type?: 'member' | 'employee';
  is_super_admin?: boolean;
  is_platform_super_admin?: boolean;
};

function readUser(req: Request): JwtUserLike | undefined {
  return (req as Request & { user?: JwtUserLike }).user;
}

/**
 * 从请求解析访问作用域（依赖 authMiddleware 已写入的 req.user；未登录则为 anonymous）。
 */
export function resolveAccessScope(req: Request): AccessScope {
  const u = readUser(req);
  if (!u?.id) {
    return {
      tenantId: null,
      employeeId: null,
      memberId: null,
      principalType: 'anonymous',
      isPlatformSuperAdmin: false,
      isTenantSuperAdmin: false,
    };
  }
  if (u.type === 'member') {
    return {
      tenantId: u.tenant_id ?? null,
      employeeId: null,
      memberId: u.id,
      principalType: 'member',
      isPlatformSuperAdmin: false,
      isTenantSuperAdmin: false,
    };
  }
  return {
    tenantId: u.tenant_id ?? null,
    employeeId: u.id,
    memberId: null,
    principalType: 'employee',
    isPlatformSuperAdmin: !!u.is_platform_super_admin,
    isTenantSuperAdmin: !!u.is_super_admin,
  };
}

// ─── 租户解析工具 ─────────────────────────────────────────────────────────

export type TenantResolutionMode =
  | 'own_only'         // 只能操作本租户（忽略请求中的 tenant_id）
  | 'admin_delegate'   // 平台超管可指定目标租户，普通用户只能操作本租户
  | 'admin_all';       // 平台超管不传 tenant_id 时返回 null（查全部）

/**
 * 统一租户 ID 解析：controller 只需传入调用方请求的 tenantId 和模式，
 * 此函数返回应该实际使用的 tenantId，或 403 拒绝。
 *
 * 返回值：
 *   { tenantId, delegated } — 成功
 *   { forbidden: true, message } — 应返回 403
 *
 * 使用示例：
 *   const t = resolveEffectiveTenantId(scope, body.tenant_id, 'admin_delegate');
 *   if ('forbidden' in t) return res.status(403).json({ success: false, message: t.message });
 *   const tenantId = t.tenantId;
 */
export function resolveEffectiveTenantId(
  scope: AccessScope,
  requestedTenantId: string | null | undefined,
  mode: TenantResolutionMode = 'admin_delegate',
): { tenantId: string | null; delegated: boolean } | { forbidden: true; message: string } {
  const requested = typeof requestedTenantId === 'string' ? requestedTenantId.trim() : null;

  if (scope.isPlatformSuperAdmin) {
    if (mode === 'admin_all') {
      return { tenantId: requested || null, delegated: !!requested };
    }
    if (requested) {
      return { tenantId: requested, delegated: true };
    }
    return { tenantId: scope.tenantId || config.platformTenantId, delegated: false };
  }

  // 非平台超管：忽略请求方传入的 tenant_id
  const ownTenantId = scope.tenantId;
  if (!ownTenantId) {
    return { forbidden: true, message: 'TENANT_REQUIRED' };
  }
  if (requested && requested !== ownTenantId) {
    return { forbidden: true, message: 'NO_PERMISSION' };
  }
  return { tenantId: ownTenantId, delegated: false };
}

// ─── 中间件工具 ─────────────────────────────────────────────────────────

type AuthenticatedReq = Request & { user?: JwtUserLike; accessScope?: AccessScope };

/** 仅平台超管可访问；authMiddleware 之后使用 */
export function requirePlatformAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const u = readUser(req);
  if (!u?.is_platform_super_admin) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Platform admin only' },
    });
    return;
  }
  next();
}

/** 仅员工可访问（排除会员和匿名）；authMiddleware 之后使用 */
export function requireEmployee(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authReq = req as AuthenticatedReq;
  if (!authReq.user?.id || authReq.user.type === 'member') {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Employee access required' },
    });
    return;
  }
  next();
}

/** 仅管理员角色的员工可访问（admin / super_admin）；requireEmployee 之后使用 */
export function requireAdminRole(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const u = readUser(req);
  if (!u) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin role required' } });
    return;
  }
  const role = (req as AuthenticatedReq & { user?: { role?: string } }).user?.role;
  if (u.is_platform_super_admin || u.is_super_admin || role === 'admin') {
    next();
    return;
  }
  res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin role required' } });
}
