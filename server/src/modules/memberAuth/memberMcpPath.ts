/**
 * 会员「强制改密」期间：除改密与门户皮肤拉取外，禁止其它需会员 JWT 的接口。
 */
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';

export function apiPathFromRequest(req: Pick<Request, 'originalUrl' | 'url'>): string {
  const raw = (req.originalUrl || req.url || '').split('?')[0] || '';
  return raw.replace(/\/+$/, '') || '/';
}

/** 全局 authMiddleware：会员 mcp 时仍放行 */
export function isMemberMcpExemptGlobalRequest(req: AuthenticatedRequest): boolean {
  if (req.user?.type !== 'member' || !req.user?.id) return false;
  const p = apiPathFromRequest(req);
  const mid = req.user.id;
  if (req.method === 'POST' && p.endsWith('/api/member-auth/set-password')) return true;
  if (req.method === 'GET' && p === `/api/member-portal-settings/by-member/${mid}`) return true;
  return false;
}

/** member-auth 路由内：强制改密时禁止拉取 /info（改密页仅用本地 session）— 同时拦截 POST */
export function isMemberAuthInfoGet(req: Pick<Request, 'method' | 'originalUrl' | 'url'>): boolean {
  return (req.method === 'GET' || req.method === 'POST') && apiPathFromRequest(req).endsWith('/api/member-auth/info');
}
