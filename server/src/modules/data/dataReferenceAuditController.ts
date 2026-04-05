/**
 * Data controllers — login logs, lookups, audit, role permissions
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import {
  listRolePermissionsRepository,
  saveRolePermissionsBatch,
  listAuditRecordsRepository,
  countPendingAuditRecordsRepository,
  listCurrenciesRepository,
  listActivityTypesRepository,
  listCustomerSourcesRepository,
  listShiftReceiversRepository,
  listShiftHandoversRepository,
} from './repository.js';
import { getLoginLogsListPayload } from '../logs/service.js';
import { resolveTenantId, errorMessageForResponse } from './dataControllerShared.js';

export async function getLoginLogsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const isPlatform = !!req.user?.is_platform_super_admin;
    const queryRaw = req.query.tenant_id;
    const queryTenantId = typeof queryRaw === 'string' ? queryRaw.trim() : '';
    const tenantId = isPlatform
      ? (queryTenantId || null)
      : (req.user?.tenant_id ?? null);
    const pageSize = Math.min(parseInt(String(req.query.page_size || req.query.limit || 100), 10), 500);
    const page = Math.max(1, parseInt(String(req.query.page || 1), 10));

    // 角色级别过滤：admin 看全部，manager 看下属+自己，staff 只看自己
    const role = req.user?.role ?? 'staff';
    const employeeId = req.user?.id ?? null;

    console.log('[API] getLoginLogs tenant_id=', tenantId || 'all', 'role=', role, 'page=', page, 'pageSize=', pageSize);
    const payload = await getLoginLogsListPayload({
      pageSize,
      tenantId,
      page,
      role,
      employeeId,
    });
    res.json({
      success: true,
      data: payload,
    });
  } catch (e) {
    console.error('[Data] getLoginLogs error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch login logs' } });
  }
}

export async function getCurrenciesController(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await listCurrenciesRepository();
    res.json({ success: true, data });
  } catch (e) {
    console.error('[Data] getCurrencies error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch currencies' } });
  }
}

export async function getActivityTypesController(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await listActivityTypesRepository();
    res.json({ success: true, data });
  } catch (e) {
    console.error('[Data] getActivityTypes error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch activity types' } });
  }
}

export async function getCustomerSourcesController(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await listCustomerSourcesRepository();
    res.json({ success: true, data });
  } catch (e) {
    console.error('[Data] getCustomerSources error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch customer sources' } });
  }
}

export async function getShiftReceiversController(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await listShiftReceiversRepository();
    res.json({ success: true, data });
  } catch (e) {
    console.error('[Data] getShiftReceivers error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch shift receivers' } });
  }
}

export async function getShiftHandoversController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const isPlatform = !!req.user?.is_platform_super_admin;
    const queryTenantId = req.query.tenant_id as string | undefined;
    const tenantId = isPlatform && queryTenantId
      ? queryTenantId
      : (req.user?.tenant_id ?? null);
    const data = await listShiftHandoversRepository(tenantId);
    res.json({ success: true, data });
  } catch (e) {
    console.error('[Data] getShiftHandovers error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch shift handovers' } });
  }
}

export async function getAuditRecordsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const isPlatform = !!req.user?.is_platform_super_admin;
    const queryTenantIdRaw = req.query.tenant_id;
    const queryTenantId =
      typeof queryTenantIdRaw === 'string' && queryTenantIdRaw.trim() ? queryTenantIdRaw.trim() : '';
    /** 平台超管：显式传 tenant_id 则按租户筛选；不传则全站（与登录日志等平台列表一致） */
    const tenantId = isPlatform ? (queryTenantId || null) : (req.user?.tenant_id ?? null);
    const page = parseInt(String(req.query.page || 1), 10);
    const pageSize = parseInt(String(req.query.pageSize || 50), 10);
    const status = req.query.status as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const searchTerm = req.query.searchTerm as string | undefined;
    const { data, count } = await listAuditRecordsRepository({
      page,
      pageSize,
      status,
      dateFrom,
      dateTo,
      tenantId,
      searchTerm,
    });
    res.json({ success: true, data: { records: data, totalCount: count } });
  } catch (e) {
    console.error('[Data] getAuditRecords error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch audit records' } });
  }
}

export async function getPendingAuditCountController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const isPlatform = !!req.user?.is_platform_super_admin;
    const queryTenantIdRaw = req.query.tenant_id;
    const queryTenantId =
      typeof queryTenantIdRaw === 'string' && queryTenantIdRaw.trim() ? queryTenantIdRaw.trim() : '';
    const tenantId = isPlatform ? (queryTenantId || null) : (req.user?.tenant_id ?? null);
    const count = await countPendingAuditRecordsRepository(tenantId);
    res.json({ success: true, data: { count } });
  } catch (e) {
    console.error('[Data] getPendingAuditCount error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch pending audit count' } });
  }
}

export async function getRolePermissionsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await listRolePermissionsRepository();
    res.json({ success: true, data });
  } catch (e) {
    console.error('[Data] getRolePermissions error:', e);
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: 'Failed to fetch permissions' });
  }
}

export async function saveRolePermissionsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { role: targetRole, permissions } = req.body || {};
    if (!targetRole || !Array.isArray(permissions)) {
      res.status(400).json({
        success: false,
        error: 'Missing role or permissions array',
        code: 'VALIDATION_ERROR',
        message: 'Missing role or permissions array',
      });
      return;
    }

    const isNavOnly = permissions.length === 0 || permissions.every(
      (p: { module_name?: string }) =>
        p.module_name === 'navigation' || p.module_name === 'dashboard',
    );

    const isSuperAdmin = !!req.user?.is_super_admin || !!req.user?.is_platform_super_admin;
    const isAdminRole = req.user?.role === 'admin';
    const isManagerRole = req.user?.role === 'manager';

    console.log('[saveRolePermissions] user=%s role=%s is_super_admin=%s is_platform=%s | targetRole=%s permsCount=%d isNavOnly=%s',
      req.user?.username, req.user?.role, req.user?.is_super_admin, req.user?.is_platform_super_admin,
      targetRole, permissions.length, isNavOnly);

    if (isNavOnly) {
      if (!isAdminRole && !isManagerRole && !isSuperAdmin) {
        console.warn('[saveRolePermissions] REJECTED (nav): user lacks admin/manager/super_admin');
        res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Only admin/manager/super_admin can modify navigation permissions',
        });
        return;
      }
    } else {
      if (!isSuperAdmin && !isAdminRole) {
        console.warn('[saveRolePermissions] REJECTED (data): user lacks admin/super_admin');
        res.status(403).json({
          success: false,
          code: 'FORBIDDEN',
          message: 'Only admin/super_admin can modify data field permissions',
        });
        return;
      }
    }

    const saved = await saveRolePermissionsBatch(targetRole, permissions);
    console.log('[saveRolePermissions] OK saved=%d for targetRole=%s', saved, targetRole);
    res.json({ success: true, data: { saved } });
  } catch (e: any) {
    console.error('[Data] saveRolePermissions error:', e);
    res.status(500).json({
      success: false,
      code: 'INTERNAL_ERROR',
      message: e?.message || 'Failed to save permissions',
      error: e?.message || 'Failed to save permissions',
    });
  }
}

