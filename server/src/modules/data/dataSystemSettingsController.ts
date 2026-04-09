/**
 * Data controllers — repair, debug, IP, shared store, activity data, gifts, retention
 */
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { logger } from '../../lib/logger.js';
import {
  getIpAccessControlSetting as getIpAccessControlSettingRepository,
  getSharedData as getSharedDataRepository,
  upsertSharedData as upsertSharedDataRepository,
  getMultipleSharedData as getMultipleSharedDataRepository,
  listActivityData as listActivityDataRepository,
  updateActivityGift as updateActivityGiftRepository,
  deleteActivityGift as deleteActivityGiftRepository,
  getActivityDataRetentionSettings as getActivityDataRetentionSettingsRepository,
  saveActivityDataRetentionSettings as saveActivityDataRetentionSettingsRepository,
  runManualActivityDataPurge as runManualActivityDataPurgeRepository,
  purgeAllActivityDataByTenant as purgeAllActivityDataByTenantRepository,
} from './systemSettingsService.js';
import { repairKnowledgeFields } from './knowledgeRepair.js';
import { evaluateCountryLogin, normalizeIpAccessControl } from '../../lib/ipAccessControlConfig.js';
import { lookupCountryByIp } from '../../lib/ipCountryLookup.js';
import { getRequestClientIp } from '../../lib/requestClientIp.js';
import {
  TENANT_STAFF_LOGIN_IP_STORE_KEY,
  sanitizeTenantStaffLoginIpPayloadForStorage,
} from '../../lib/staffLoginAccess.js';
import {
  resolveTenantId,
  tenantIdForKnowledgeCreate,
  mergeCopySettingsWrite,
  sanitizeSharedDataPayload,
  auditPlatformDelegation,
  errorMessageForResponse,
  canManageKnowledge,
  canManageStaffLoginIpSettings,
  canManageActivityDataRetentionSettings,
  tenantIdForPlatformDelegatedWrite,
} from './dataControllerShared.js';

export async function repairKnowledgeFieldsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'manager' && !req.user?.is_platform_super_admin) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
      return;
    }
    const data = await repairKnowledgeFields();
    res.json({ success: true, data });
  } catch (e) {
    logger.error('Data', 'repairKnowledgeFields error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: String((e as Error).message) } });
  }
}

export async function seedKnowledgeCategoriesController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'manager' && !req.user?.is_platform_super_admin) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
      return;
    }
    const { seedDefaultKnowledgeCategories } = await import('./knowledgeDataService.js');
    const tenantId = req.user?.tenant_id ?? null;
    const result = await seedDefaultKnowledgeCategories(tenantId);
    res.json({ success: true, data: result });
  } catch (e) {
    logger.error('Data', 'seedKnowledgeCategories error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: String((e as Error).message) } });
  }
}

export async function getDataDebugController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (req.user?.type !== 'employee') {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Employee access required' } });
    return;
  }
  try {
    const { getDataDebugCounts } = await import('./systemSettingsService.js');
    const data = await getDataDebugCounts();
    res.json({ success: true, data });
  } catch (e) {
    logger.error('Data', 'getDataDebug error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: String((e as Error).message) } });
  }
}

export async function getIpAccessControlController(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const raw = await getIpAccessControlSettingRepository();
    const data = normalizeIpAccessControl(raw);
    res.json({ success: true, data });
  } catch (e) {
    logger.error('Data', 'getIpAccessControl error:', e);
    res.json({ success: true, data: normalizeIpAccessControl(null) });
  }
}

/** 登录前可调用：按 data_settings 中国家策略校验当前请求 IP（无需 JWT） */
export async function getIpCountryCheckController(req: Request, res: Response): Promise<void> {
  try {
    const raw = await getIpAccessControlSettingRepository();
    const norm = normalizeIpAccessControl(raw);
    const clientIp = getRequestClientIp(req);

    if (!norm.country_restrict_login) {
      res.json({
        success: true,
        data: {
          valid: true,
          skipped: true,
          reason: 'country_restrict_off',
          ip: clientIp,
        },
      });
      return;
    }

    if (norm.country_codes.length === 0) {
      res.json({
        success: true,
        data: {
          valid: true,
          skipped: true,
          reason: 'no_country_codes_configured',
          ip: clientIp,
        },
      });
      return;
    }

    const loc = await lookupCountryByIp(clientIp);
    const ev = evaluateCountryLogin(loc.country_code, norm);

    if (ev.allowed) {
      res.json({
        success: true,
        data: {
          valid: true,
          skipped: false,
          ip: clientIp,
          country_code: loc.country_code,
          country_name: loc.country_name,
        },
      });
      return;
    }

    const modeHint =
      norm.country_mode === 'allow'
        ? 'Only countries/regions in the allowlist can log in.'
        : 'Your country/region is blocked from logging in.';
    res.json({
      success: true,
      data: {
        valid: false,
        skipped: false,
        ip: clientIp,
        country_code: loc.country_code,
        country_name: loc.country_name,
        error: 'IP_COUNTRY_NOT_ALLOWED',
        message:
          norm.country_mode === 'allow'
            ? `Access denied: current IP (${clientIp}) is not in the allowed region list. ${modeHint}`
            : `Access denied: current IP (${clientIp}) is from a restricted country/region (${loc.country_name || loc.country_code || 'Unknown'}). ${modeHint}`,
      },
    });
  } catch (e) {
    logger.error('Data', 'getIpCountryCheck error:', e);
    res.json({
      success: true,
      data: {
        valid: true,
        skipped: true,
        reason: 'check_error',
      },
    });
  }
}

export async function getSharedDataController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const queryTenantId = req.query.tenant_id as string | undefined;
    const dataKey = (req.query.data_key || req.query.key) as string;
    if (!dataKey) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'data_key required' } });
      return;
    }
    if (dataKey === TENANT_STAFF_LOGIN_IP_STORE_KEY && !canManageStaffLoginIpSettings(req)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'No permission to view this configuration' } });
      return;
    }
    const tenantId = resolveTenantId(req, queryTenantId);
    if (!tenantId) {
      res.json({ success: true, data: null });
      return;
    }
    const data = await getSharedDataRepository(tenantId, dataKey);
    res.json({ success: true, data: data ?? null });
  } catch (e) {
    logger.error('Data', 'getSharedData error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch shared data' } });
  }
}

export async function postSharedDataController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const body = req.body as {
      data_key?: string;
      data_value?: unknown;
      /** 仅平台超管：代管目标租户（优先于 JWT） */
      target_tenant_id?: string;
      tenant_id?: string;
    };
    const dataKey = body?.data_key ?? (req.query.data_key as string);
    const dataValue = body?.data_value;
    if (!dataKey) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'data_key required' } });
      return;
    }
    if (dataKey === TENANT_STAFF_LOGIN_IP_STORE_KEY && !canManageStaffLoginIpSettings(req)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Only tenant admins can configure staff login IP allowlist' } });
      return;
    }
    const { target_tenant_id, tenant_id } = body;
    const { tenantId, delegated } = tenantIdForPlatformDelegatedWrite(req, { target_tenant_id, tenant_id });
    if (!tenantId) {
      res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'Account not bound to a tenant' } });
      return;
    }
    const payload =
      dataKey === 'copySettings'
        ? mergeCopySettingsWrite(dataValue, await getSharedDataRepository(tenantId, dataKey))
        : sanitizeSharedDataPayload(dataKey, dataValue);
    const ok = await upsertSharedDataRepository(tenantId, dataKey, payload);
    if (delegated) {
      logger.info(
        'Data',
        `platform delegation: postSharedData key=${dataKey} → tenant_id=${tenantId} by ${req.user?.id ?? ''}`,
      );
      void auditPlatformDelegation(req, {
        operation_type: 'shared_data_upsert_delegated',
        object_id: dataKey,
        after_data: { target_tenant_id: tenantId, data_key: dataKey, success: ok },
      });
    }
    res.json({ success: ok });
  } catch (e) {
    const msg = errorMessageForResponse(e);
    logger.error('Data', 'postSharedData error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: msg } });
  }
}

export async function getSharedDataBatchController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const keysParam = req.query.keys as string;
    const queryTenantId = req.query.tenant_id as string | undefined;
    const dataKeys = keysParam ? keysParam.split(',').map(k => k.trim()).filter(Boolean) : [];
    if (dataKeys.length === 0) {
      res.json({ success: true, data: {} });
      return;
    }
    const tenantId = resolveTenantId(req, queryTenantId);
    if (!tenantId) {
      res.json({ success: true, data: {} });
      return;
    }
    const data = await getMultipleSharedDataRepository(tenantId, dataKeys);
    res.json({ success: true, data: data && typeof data === 'object' ? data : {} });
  } catch (e) {
    logger.error('Data', 'getSharedDataBatch error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch shared data' } });
  }
}

export async function getActivityDataController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const queryTenantId = req.query.tenant_id as string | undefined;
    const tenantId = resolveTenantId(req, queryTenantId);
    if (!tenantId) {
      res.json({ success: true, data: { gifts: [], referrals: [], memberActivities: [], pointsLedgerData: [], pointsAccountsData: [], spinCreditsData: [] } });
      return;
    }
    const data = await listActivityDataRepository(tenantId);
    res.json({ success: true, data });
  } catch (e) {
    logger.error('Data', 'getActivityData error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch activity data' } });
  }
}

export async function getSpinCreditsDetailController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const memberId = req.params.memberId;
    if (!memberId) { res.status(400).json({ success: false, error: 'INVALID_PARAMS' }); return; }
    const { getSpinCreditsDetail } = await import('./systemSettingsService.js');
    const data = await getSpinCreditsDetail(memberId);
    res.json({ success: true, ...data });
  } catch (e) {
    logger.error('Data', 'getSpinCreditsDetail:', e);
    res.status(500).json({ success: false, error: (e as Error).message });
  }
}

export async function patchActivityGiftController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
      return;
    }
    const body = req.body as {
      currency?: string;
      amount?: number | string;
      rate?: number | string;
      phone_number?: string;
      payment_agent?: string | null;
      gift_type?: string | null;
      fee?: number | string | null;
      gift_value?: number | string | null;
      remark?: string | null;
      creator_id?: string | null;
      tenant_id?: string;
    };
    const tenantId = resolveTenantId(req, body?.tenant_id ?? (req.query.tenant_id as string | undefined));
    const data = await updateActivityGiftRepository(id, body, tenantId);
    if (!data) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Activity gift not found' } });
      return;
    }
    res.json({ success: true, data });
  } catch (e) {
    logger.error('Data', 'patchActivityGift error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update activity gift' } });
  }
}

export async function deleteActivityGiftController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
      return;
    }
    const tenantId = resolveTenantId(
      req,
      ((req.body as { tenant_id?: string } | undefined)?.tenant_id) ?? (req.query.tenant_id as string | undefined)
    );
    const result = await deleteActivityGiftRepository(id, tenantId);
    if (!result.gift) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Activity gift not found' } });
      return;
    }
    res.json({ success: true, data: result });
  } catch (e) {
    logger.error('Data', 'deleteActivityGift error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete activity gift' } });
  }
}

export async function getActivityDataRetentionController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const queryTenantId = req.query.tenant_id as string | undefined;
    const tenantId = resolveTenantId(req, queryTenantId);
    if (!tenantId) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'tenant required' } });
      return;
    }
    const settings = await getActivityDataRetentionSettingsRepository(tenantId);
    res.json({ success: true, data: settings });
  } catch (e) {
    logger.error('Data', 'getActivityDataRetention error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to load retention settings' } });
  }
}

export async function putActivityDataRetentionController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!canManageKnowledge(req)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Permission denied' } });
      return;
    }
    const queryTenantId = (req.query.tenant_id as string | undefined) ?? (req.body as { tenant_id?: string })?.tenant_id;
    const tenantId = resolveTenantId(req, queryTenantId);
    if (!tenantId) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'tenant required' } });
      return;
    }
    const body = req.body as { enabled?: unknown; retentionDays?: unknown };
    const enabled = !!body.enabled;
    const retentionDays = Number(body.retentionDays);
    if (!Number.isFinite(retentionDays) || retentionDays < 1 || retentionDays > 3650) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'retentionDays must be between 1 and 3650' },
      });
      return;
    }
    const settings = await saveActivityDataRetentionSettingsRepository(tenantId, { enabled, retentionDays });
    res.json({ success: true, data: settings });
  } catch (e) {
    logger.error('Data', 'putActivityDataRetention error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to save retention settings' } });
  }
}

export async function postActivityDataRetentionRunController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!canManageActivityDataRetentionSettings(req)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Permission denied' } });
      return;
    }
    const queryTenantId = req.query.tenant_id as string | undefined;
    const tenantId = resolveTenantId(req, queryTenantId);
    if (!tenantId) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'tenant required' } });
      return;
    }
    const { summary, settings } = await runManualActivityDataPurgeRepository(tenantId);
    res.json({ success: true, data: { summary, settings } });
  } catch (e) {
    logger.error('Data', 'postActivityDataRetentionRun error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to run cleanup' } });
  }
}

export async function postActivityDataRetentionPurgeAllController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!canManageActivityDataRetentionSettings(req)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Permission denied' } });
      return;
    }
    const queryTenantId = req.query.tenant_id as string | undefined;
    const tenantId = resolveTenantId(req, queryTenantId);
    if (!tenantId) {
      res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'tenant required' } });
      return;
    }
    const summary = await purgeAllActivityDataByTenantRepository(tenantId);
    res.json({ success: true, summary });
  } catch (e) {
    logger.error('Data', 'postActivityDataRetentionPurgeAll error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to purge all activity data' } });
  }
}

