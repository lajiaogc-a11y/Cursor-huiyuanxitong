/**
 * Data controllers — shared tenant / knowledge / audit helpers
 */
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import {
  insertOperationLogRepository,
  listKnowledgeReadStatusRepository,
  getKnowledgeUnreadCountRepository,
  getKnowledgeUnreadCountsRepository,
  markKnowledgeArticleReadRepository,
  markAllKnowledgeArticlesReadRepository,
  listRolePermissionsRepository,
  saveRolePermissionsBatch,
  getIpAccessControlSettingRepository,
  getSharedDataRepository,
  upsertSharedDataRepository,
  getMultipleSharedDataRepository,
  listActivityDataRepository,
  listCurrenciesRepository,
  listActivityTypesRepository,
  listCustomerSourcesRepository,
  listShiftReceiversRepository,
  listShiftHandoversRepository,
  listAuditRecordsRepository,
  countPendingAuditRecordsRepository,
  updateActivityGiftRepository,
  deleteActivityGiftRepository,
  createKnowledgeCategoryRepository,
  updateKnowledgeCategoryRepository,
  deleteKnowledgeCategoryRepository,
  createKnowledgeArticleRepository,
  updateKnowledgeArticleRepository,
  deleteKnowledgeArticleRepository,
  markOperationLogRestoredRepository,
} from './repository.js';
import { listKnowledgeCategories, listKnowledgeArticles } from '../knowledge/service.js';
import { getOperationLogsListPayload, getLoginLogsListPayload } from '../logs/service.js';
import {
  getActivityDataRetentionSettingsRepository,
  saveActivityDataRetentionSettingsRepository,
  runManualActivityDataPurgeRepository,
  purgeAllActivityDataByTenantRepository,
} from './activityDataRetentionRepository.js';
import { repairKnowledgeFields } from './knowledgeRepair.js';
import { evaluateCountryLogin, normalizeIpAccessControl } from '../../lib/ipAccessControlConfig.js';
import { lookupCountryByIp } from '../../lib/ipCountryLookup.js';
import { getRequestClientIp } from '../../lib/requestClientIp.js';
import {
  TENANT_STAFF_LOGIN_IP_STORE_KEY,
  sanitizeTenantStaffLoginIpPayloadForStorage,
} from '../../lib/staffLoginAccess.js';
import { config } from '../../config/index.js';
const PLATFORM_TENANT_ID = config.platformTenantId;

export function resolveTenantId(
  req: AuthenticatedRequest,
  requestedTenantId?: string | null,
  allowPlatformAll = false
): string | null | undefined {
  if (req.user?.is_platform_super_admin) {
    if (requestedTenantId) return requestedTenantId;
    // 平台超管没指定租户时：allowPlatformAll 返回 null（查全部），否则用平台租户
    return allowPlatformAll ? null : (req.user?.tenant_id || PLATFORM_TENANT_ID);
  }
  return req.user?.tenant_id ?? null;
}

/**
 * 知识库「创建」类写入：tenant_id 仅来自当前登录用户 JWT，禁止 body / query 注入。
 * 平台超管无 tenant_id 时落到平台租户常量（与 resolveTenantId 非 allowPlatformAll 行为一致）。
 */
export function tenantIdForKnowledgeCreate(req: AuthenticatedRequest): string | null {
  const tid = typeof req.user?.tenant_id === 'string' ? req.user.tenant_id.trim() : '';
  if (tid) return tid;
  if (req.user?.is_platform_super_admin) return PLATFORM_TENANT_ID;
  return null;
}

/** 知识库更新/删除：默认与创建相同；平台超管可用 body 显式代管目标租户（见 tenantIdForPlatformDelegatedWrite） */
export function tenantIdForKnowledgeWriteScope(req: AuthenticatedRequest): string | null {
  return tenantIdForKnowledgeCreate(req);
}

export function clientIpForAudit(req: AuthenticatedRequest): string | null {
  const forwarded = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim();
  return forwarded || (req.headers['x-real-ip'] as string) || req.socket?.remoteAddress || null;
}

/**
 * 平台超管「代管」写入：仅 is_platform_super_admin 可读 body.target_tenant_id（推荐）或 body.tenant_id；
 * 其他角色完全忽略上述字段，等价 tenantIdForKnowledgeCreate。
 */
export function tenantIdForPlatformDelegatedWrite(
  req: AuthenticatedRequest,
  body: { target_tenant_id?: string; tenant_id?: string }
): { tenantId: string | null; delegated: boolean } {
  if (!req.user?.is_platform_super_admin) {
    return { tenantId: tenantIdForKnowledgeCreate(req), delegated: false };
  }
  const explicit = String(body?.target_tenant_id ?? body?.tenant_id ?? '').trim();
  if (explicit) return { tenantId: explicit, delegated: true };
  return { tenantId: tenantIdForKnowledgeCreate(req), delegated: false };
}

/**
 * copySettings 写入：与库中已有值合并；仅更新请求体里显式出现的字段。
 * 避免旧 sanitize 把缺失的 customNote 写成 '' 覆盖掉原有长文案；并兼容 legacy `template`。
 */
export function mergeCopySettingsWrite(incoming: unknown, existing: unknown): Record<string, boolean | string> {
  const parseBase = (u: unknown): { enabled: boolean; customNote: string; customNoteEnglish: string } => {
    let enabled = true;
    let customNote = '';
    let customNoteEnglish = '';
    if (u && typeof u === 'object' && !Array.isArray(u)) {
      const x = u as Record<string, unknown>;
      if (typeof x.enabled === 'boolean') enabled = x.enabled;
      const legacy = typeof x.template === 'string' ? x.template : '';
      if ('customNote' in x && typeof x.customNote === 'string') customNote = x.customNote;
      else if (legacy.trim()) customNote = legacy;
      if ('customNoteEnglish' in x && typeof x.customNoteEnglish === 'string') {
        customNoteEnglish = x.customNoteEnglish;
      }
    }
    return { enabled, customNote, customNoteEnglish };
  };
  const base = parseBase(existing);
  const maxLen = 100_000;
  const clip = (v: unknown) => (typeof v === 'string' ? v.slice(0, maxLen) : '');
  if (incoming == null || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return { enabled: base.enabled, customNote: base.customNote, customNoteEnglish: base.customNoteEnglish };
  }
  const o = incoming as Record<string, unknown>;
  const out = { ...base };
  if (typeof o.enabled === 'boolean') out.enabled = o.enabled;
  if ('customNote' in o) out.customNote = clip(o.customNote);
  if ('customNoteEnglish' in o) out.customNoteEnglish = clip(o.customNoteEnglish);
  return out;
}

/** 写入 shared_data_store 前的键级清洗，避免非法结构/超大字段 */
export function sanitizeSharedDataPayload(dataKey: string, dataValue: unknown): unknown {
  if (dataKey === TENANT_STAFF_LOGIN_IP_STORE_KEY) {
    return sanitizeTenantStaffLoginIpPayloadForStorage(dataValue);
  }
  return dataValue ?? null;
}

export async function auditPlatformDelegation(
  req: AuthenticatedRequest,
  op: { operation_type: string; object_id?: string | null; after_data: Record<string, unknown> }
): Promise<void> {
  try {
    const u = req.user;
    await insertOperationLogRepository({
      operator_id: u?.id ?? null,
      operator_account: u?.username ?? u?.real_name ?? 'platform_super_admin',
      operator_role: u?.is_platform_super_admin ? 'platform_super_admin' : String(u?.role ?? 'unknown'),
      module: 'platform_delegation',
      operation_type: op.operation_type,
      object_id: op.object_id ?? null,
      object_description: 'Platform super-admin delegated write (explicit target_tenant_id / tenant_id)',
      before_data: null,
      after_data: op.after_data,
      ip_address: clientIpForAudit(req),
    });
  } catch (e) {
    console.warn('[Data] auditPlatformDelegation failed:', e);
  }
}

/** 全部标为已读：有租户则限本租户；平台超管无租户时 tenantId 为 null（不按 query/body 注入） */
export function tenantIdForKnowledgeMarkAllReadScope(req: AuthenticatedRequest): string | null | undefined {
  const tid = typeof req.user?.tenant_id === 'string' ? req.user.tenant_id.trim() : '';
  if (tid) return tid;
  if (req.user?.is_platform_super_admin) return null;
  return undefined;
}

export function errorMessageForResponse(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return String(e);
}

export function canManageKnowledge(req: AuthenticatedRequest): boolean {
  return !!(req.user?.is_platform_super_admin || req.user?.role === 'admin' || req.user?.role === 'manager');
}

/** 租户员工登录 IP 白名单：仅租户管理员 / 超管或平台超管 */
export function canManageStaffLoginIpSettings(req: AuthenticatedRequest): boolean {
  const u = req.user;
  if (!u || u.type !== 'employee') return false;
  if (u.is_platform_super_admin) return true;
  return u.role === 'admin' || !!u.is_super_admin;
}

/** 活动数据保留策略保存 / 立即清理：仅租户管理员或租户超管；平台超管可代管（不含 manager，与知识库 canManageKnowledge 区分） */
export function canManageActivityDataRetentionSettings(req: AuthenticatedRequest): boolean {
  const u = req.user;
  if (!u) return false;
  if (u.is_platform_super_admin) return true;
  return u.role === 'admin' || !!u.is_super_admin;
}
