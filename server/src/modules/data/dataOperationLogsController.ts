/**
 * Data controllers — operation logs
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { insertOperationLog as insertOperationLogRepository, markOperationLogRestored as markOperationLogRestoredRepository } from './operationLogsService.js';
import { getOperationLogsListPayload } from '../logs/service.js';

export async function getOperationLogsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const isPlatform = !!req.user?.is_platform_super_admin;
    const queryRaw = req.query.tenant_id;
    const queryTenantId = typeof queryRaw === 'string' ? queryRaw.trim() : '';
    // 平台超管：仅显式传 tenant_id 时按租户过滤；未传则查全部（与登录日志 / useEmployees 一致）
    const tenantId = isPlatform
      ? (queryTenantId || null)
      : (req.user?.tenant_id ?? null);
    console.log('[API] getOperationLogs tenant_id=', tenantId || 'all');
    const page = parseInt(String(req.query.page || 1), 10);
    const pageSize = parseInt(String(req.query.pageSize || 50), 10);
    const module = req.query.module as string | undefined;
    const operationType = req.query.operationType as string | undefined;
    const operatorAccount = req.query.operatorAccount as string | undefined;
    const restoreStatus = req.query.restoreStatus as string | undefined;
    const searchTerm = req.query.searchTerm as string | undefined;
    const dateStart = req.query.dateStart as string | undefined;
    const dateEnd = req.query.dateEnd as string | undefined;
    const isExport = req.query.export === '1' || req.query.export === 'true';
    const { logs, totalCount, distinctOperators, moduleCounts } = await getOperationLogsListPayload({
      page,
      pageSize,
      module,
      operationType,
      operatorAccount,
      restoreStatus,
      searchTerm,
      dateStart,
      dateEnd,
      tenantId: tenantId || undefined,
      isExport,
    });

    res.json({ success: true, data: { logs, totalCount, distinctOperators, moduleCounts } });
  } catch (e) {
    console.error('[Data] getOperationLogs error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch operation logs' } });
  }
}

/** POST /api/data/operation-logs/:id/mark-restored — 将日志标为已恢复（表代理对 operation_logs 只读，须专用接口） */
export async function postOperationLogMarkRestoredController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (req.user?.type === 'member' || !req.user) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Forbidden' } });
      return;
    }
    const adminOk =
      req.user.is_platform_super_admin ||
      req.user.is_super_admin ||
      req.user.role === 'admin';
    if (!adminOk) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin only' } });
      return;
    }

    const logId = String(req.params.id || '').trim();
    if (!logId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
      return;
    }

    const queryTenantId = typeof req.query.tenant_id === 'string' ? req.query.tenant_id.trim() : '';
    const isPlatform = !!req.user.is_platform_super_admin;
    const restoredById = req.user.id ?? null;

    let affected: number;
    if (isPlatform && !queryTenantId) {
      affected = await markOperationLogRestoredRepository(logId, restoredById, { kind: 'platform_all' });
    } else {
      const tid = isPlatform ? queryTenantId : (req.user.tenant_id ?? '');
      if (!tid) {
        res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'tenant_id required for this user' },
        });
        return;
      }
      affected = await markOperationLogRestoredRepository(logId, restoredById, { kind: 'tenant', tenantId: tid });
    }

    if (affected === 0) {
      res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Log not found or not in tenant scope' },
      });
      return;
    }

    res.json({ success: true, data: { ok: true } });
  } catch (e) {
    console.error('[Data] postOperationLogMarkRestored error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to mark restored' } });
  }
}

export async function postOperationLogController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const operatorId = (body.operatorId as string) ?? req.user?.id ?? null;
    const operatorAccount = (body.operatorAccount as string) ?? req.user?.username ?? req.user?.real_name ?? 'system';
    const operatorRole = (body.operatorRole as string) ?? req.user?.role ?? 'staff';
    const module = String(body.module ?? '');
    const operationType = String(body.operationType ?? 'update');
    const objectId = (body.objectId as string) ?? null;
    const objectDescription = (body.objectDescription as string) ?? null;
    const beforeData = body.beforeData;
    const afterData = body.afterData;
    const requestData = body.requestData ?? body.request_data;
    const targetIdsRaw = body.targetIds ?? body.target_ids;
    const targetIds = Array.isArray(targetIdsRaw)
      ? (targetIdsRaw as unknown[]).map((x) => String(x))
      : null;
    const forwardedIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      || (req.headers['x-real-ip'] as string)
      || req.socket?.remoteAddress
      || null;
    const ipAddress = (body.ipAddress as string) ?? forwardedIp;

    if (!module || !operationType) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'module and operationType required' } });
      return;
    }

    await insertOperationLogRepository({
      operator_id: operatorId,
      operator_account: operatorAccount,
      operator_role: operatorRole,
      module,
      operation_type: operationType,
      object_id: objectId,
      object_description: objectDescription,
      before_data: beforeData,
      after_data: afterData,
      request_data: requestData,
      target_ids: targetIds,
      ip_address: ipAddress,
    });
    res.json({ success: true, data: { ok: true } });
  } catch (e) {
    console.error('[Data] postOperationLog error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to save operation log' } });
  }
}
