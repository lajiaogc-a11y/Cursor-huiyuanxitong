import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { listMemberLevelsService, saveMemberLevelsService } from './service.js';
import type { MemberLevelRuleInput } from './types.js';

function resolveTenantId(req: AuthenticatedRequest, queryTenant?: string | null): string | undefined {
  const isPlatform = !!req.user?.is_platform_super_admin;
  if (isPlatform) {
    return queryTenant || req.user?.tenant_id || undefined;
  }
  return req.user?.tenant_id ?? undefined;
}

export async function getMemberLevelsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = resolveTenantId(req, (req.query.tenant_id as string) || null);
  if (!tenantId) {
    res.status(400).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'tenant_id required' } });
    return;
  }
  const data = await listMemberLevelsService(tenantId);
  res.json({ success: true, data });
}

export async function putMemberLevelsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  // H1 fix: require admin role to modify member level rules
  const role = req.user?.role;
  if (role !== 'admin' && !req.user?.is_super_admin && !req.user?.is_platform_super_admin) {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin role required' } });
    return;
  }
  const tenantId = resolveTenantId(
    req,
    ((req.query.tenant_id as string) ?? (req.body?.tenant_id as string | undefined)) ?? null,
  );
  if (!tenantId) {
    res.status(400).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'tenant_id required' } });
    return;
  }
  const rules = req.body?.rules as MemberLevelRuleInput[] | undefined;
  try {
    const data = await saveMemberLevelsService(tenantId, rules || []);
    res.json({ success: true, data });
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    if (err?.code === 'LEVEL_RULES_EMPTY') {
      res.status(400).json({ success: false, error: { code: err.code, message: err.message } });
      return;
    }
    throw e;
  }
}
