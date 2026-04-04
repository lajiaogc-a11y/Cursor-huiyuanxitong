/**
 * Data Controller - 操作日志、公司文档 API
 */
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import {
  listOperationLogsRepository,
  insertOperationLogRepository,
  listKnowledgeCategoriesRepository,
  listKnowledgeArticlesRepository,
  listKnowledgeReadStatusRepository,
  getKnowledgeUnreadCountRepository,
  getKnowledgeUnreadCountsRepository,
  markKnowledgeArticleReadRepository,
  markAllKnowledgeArticlesReadRepository,
  listLoginLogsRepository,
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
import { repairDeepStringValues, repairUtf8MisdecodedAsLatin1 } from '../../lib/utf8MojibakeRepair.js';

const PLATFORM_TENANT_ID = config.platformTenantId;

function resolveTenantId(
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
function tenantIdForKnowledgeCreate(req: AuthenticatedRequest): string | null {
  const tid = typeof req.user?.tenant_id === 'string' ? req.user.tenant_id.trim() : '';
  if (tid) return tid;
  if (req.user?.is_platform_super_admin) return PLATFORM_TENANT_ID;
  return null;
}

/** 知识库更新/删除：默认与创建相同；平台超管可用 body 显式代管目标租户（见 tenantIdForPlatformDelegatedWrite） */
function tenantIdForKnowledgeWriteScope(req: AuthenticatedRequest): string | null {
  return tenantIdForKnowledgeCreate(req);
}

function clientIpForAudit(req: AuthenticatedRequest): string | null {
  const forwarded = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim();
  return forwarded || (req.headers['x-real-ip'] as string) || req.socket?.remoteAddress || null;
}

/**
 * 平台超管「代管」写入：仅 is_platform_super_admin 可读 body.target_tenant_id（推荐）或 body.tenant_id；
 * 其他角色完全忽略上述字段，等价 tenantIdForKnowledgeCreate。
 */
function tenantIdForPlatformDelegatedWrite(
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
function mergeCopySettingsWrite(incoming: unknown, existing: unknown): Record<string, boolean | string> {
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
function sanitizeSharedDataPayload(dataKey: string, dataValue: unknown): unknown {
  if (dataKey === TENANT_STAFF_LOGIN_IP_STORE_KEY) {
    return sanitizeTenantStaffLoginIpPayloadForStorage(dataValue);
  }
  return dataValue ?? null;
}

async function auditPlatformDelegation(
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
      object_description: '平台超管代管写入（显式 target_tenant_id / tenant_id）',
      before_data: null,
      after_data: op.after_data,
      ip_address: clientIpForAudit(req),
    });
  } catch (e) {
    console.warn('[Data] auditPlatformDelegation failed:', e);
  }
}

/** 全部标为已读：有租户则限本租户；平台超管无租户时 tenantId 为 null（不按 query/body 注入） */
function tenantIdForKnowledgeMarkAllReadScope(req: AuthenticatedRequest): string | null | undefined {
  const tid = typeof req.user?.tenant_id === 'string' ? req.user.tenant_id.trim() : '';
  if (tid) return tid;
  if (req.user?.is_platform_super_admin) return null;
  return undefined;
}

function errorMessageForResponse(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'object' && e !== null && 'message' in e && typeof (e as { message: unknown }).message === 'string') {
    return (e as { message: string }).message;
  }
  return String(e);
}

function canManageKnowledge(req: AuthenticatedRequest): boolean {
  return !!(req.user?.is_platform_super_admin || req.user?.role === 'admin' || req.user?.role === 'manager');
}

/** 租户员工登录 IP 白名单：仅租户管理员 / 超管或平台超管 */
function canManageStaffLoginIpSettings(req: AuthenticatedRequest): boolean {
  const u = req.user;
  if (!u || u.type !== 'employee') return false;
  if (u.is_platform_super_admin) return true;
  return u.role === 'admin' || !!u.is_super_admin;
}

/** 活动数据保留策略保存 / 立即清理：仅租户管理员或租户超管；平台超管可代管（不含 manager，与知识库 canManageKnowledge 区分） */
function canManageActivityDataRetentionSettings(req: AuthenticatedRequest): boolean {
  const u = req.user;
  if (!u) return false;
  if (u.is_platform_super_admin) return true;
  return u.role === 'admin' || !!u.is_super_admin;
}

/** 将 operation_logs 中 JSON 列可能返回的 string / double-encoded string 转为对象，减轻前端误解析 */
function coerceOperationLogJsonColumn(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === 'object') return repairDeepStringValues(value);
  if (typeof value !== 'string') return value;
  let v: unknown = repairUtf8MisdecodedAsLatin1(value).trim();
  if (v === '') return null;
  for (let i = 0; i < 3; i++) {
    if (typeof v !== 'string') break;
    const s = v.trim();
    if (!s) return null;
    try {
      v = JSON.parse(s);
    } catch {
      return repairUtf8MisdecodedAsLatin1(value);
    }
  }
  return repairDeepStringValues(v);
}

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
    const { data, count, distinctOperators, moduleCounts } = await listOperationLogsRepository({
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
      export: isExport,
    });

    const logs = data.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      operatorId: r.operator_id,
      operatorAccount: repairUtf8MisdecodedAsLatin1(r.operator_account ?? ''),
      operatorRole: repairUtf8MisdecodedAsLatin1(r.operator_role ?? ''),
      module: repairUtf8MisdecodedAsLatin1(String(r.module ?? '')),
      operationType: repairUtf8MisdecodedAsLatin1(String(r.operation_type ?? '')),
      objectId: r.object_id,
      objectDescription: r.object_description
        ? repairUtf8MisdecodedAsLatin1(r.object_description)
        : r.object_description,
      beforeData: coerceOperationLogJsonColumn(r.before_data),
      afterData: coerceOperationLogJsonColumn(r.after_data),
      ipAddress: r.ip_address,
      isRestored: !!(r.is_restored),
      restoredBy: r.restored_by,
      restoredAt: r.restored_at,
    }));

    res.json({ success: true, data: { logs, totalCount: count, distinctOperators, moduleCounts } });
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
      ip_address: ipAddress,
    });
    res.json({ success: true, data: { ok: true } });
  } catch (e) {
    console.error('[Data] postOperationLog error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to save operation log' } });
  }
}

export async function getKnowledgeCategoriesController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const tenantId = resolveTenantId(req, (req.query.tenant_id as string | undefined) ?? undefined, true);
    console.log('[API] getKnowledgeCategories tenant_id=', tenantId || 'all');

    const viewerEmployeeId = req.user?.type === 'employee' ? req.user.id : null;
    const data = await listKnowledgeCategoriesRepository(tenantId, viewerEmployeeId);
    res.json({ success: true, data });
  } catch (e) {
    console.error('[Data] getKnowledgeCategories error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch knowledge categories' } });
  }
}

export async function getKnowledgeArticlesController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const categoryId = req.params.categoryId;
    if (!categoryId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'categoryId required' } });
      return;
    }
    const tenantId = resolveTenantId(req, (req.query.tenant_id as string | undefined) ?? undefined, true);
    const employeeId = req.user?.id;

    const data = await listKnowledgeArticlesRepository(
      categoryId,
      tenantId,
      employeeId ?? null,
    );
    res.json({ success: true, data });
  } catch (e) {
    console.error('[Data] getKnowledgeArticles error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch knowledge articles' } });
  }
}

export async function postKnowledgeCategoryController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!canManageKnowledge(req)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '仅管理员可操作' } });
      return;
    }
    const body = req.body as {
      name?: string;
      content_type?: 'text' | 'phrase' | 'image';
      sort_order?: number;
      visibility?: 'public' | 'private';
    };
    if (!body?.name || !body?.content_type) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name and content_type required' } });
      return;
    }
    const tenantId = tenantIdForKnowledgeCreate(req);
    if (!tenantId) {
      res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: '当前账号未绑定租户，无法创建知识库分类' } });
      return;
    }
    const data = await createKnowledgeCategoryRepository({
      tenant_id: tenantId,
      name: body.name,
      content_type: body.content_type,
      sort_order: body.sort_order ?? 1,
      visibility: body.visibility ?? 'private',
      created_by: req.user?.id ?? null,
    });
    res.status(201).json({ success: true, data });
  } catch (e) {
    const msg = errorMessageForResponse(e);
    console.error('[Data] postKnowledgeCategory error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: msg } });
  }
}

export async function patchKnowledgeCategoryController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!canManageKnowledge(req)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '仅管理员可操作' } });
      return;
    }
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
      return;
    }
    const body = req.body as {
      name?: string;
      content_type?: 'text' | 'phrase' | 'image';
      sort_order?: number;
      visibility?: 'public' | 'private';
      is_active?: boolean;
      /** 仅平台超管：代管目标租户 */
      target_tenant_id?: string;
      tenant_id?: string;
    };
    const { target_tenant_id, tenant_id, ...categoryPatch } = body;
    const { tenantId, delegated } = tenantIdForPlatformDelegatedWrite(req, { target_tenant_id, tenant_id });
    if (!tenantId) {
      res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: '当前账号未绑定租户' } });
      return;
    }
    const data = await updateKnowledgeCategoryRepository(id, categoryPatch, tenantId);
    if (!data) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: '分类不存在，或不在当前租户范围内（平台管理员请先选择目标租户后再编辑）',
        },
      });
      return;
    }
    if (delegated) {
      console.log(
        `[Data] platform delegation: patchKnowledgeCategory category=${id} → tenant_id=${tenantId} by ${req.user?.id ?? ''}`,
      );
      void auditPlatformDelegation(req, {
        operation_type: 'knowledge_category_patch_delegated',
        object_id: id,
        after_data: { target_tenant_id: tenantId, category_id: id, patch_keys: Object.keys(categoryPatch) },
      });
    }
    res.json({ success: true, data });
  } catch (e) {
    const msg = errorMessageForResponse(e);
    console.error('[Data] patchKnowledgeCategory error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: msg } });
  }
}

export async function deleteKnowledgeCategoryController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!canManageKnowledge(req)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '仅管理员可操作' } });
      return;
    }
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
      return;
    }
    const tenantId = tenantIdForKnowledgeWriteScope(req);
    if (!tenantId) {
      res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: '当前账号未绑定租户' } });
      return;
    }
    const ok = await deleteKnowledgeCategoryRepository(id, tenantId);
    if (!ok) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Knowledge category not found' } });
      return;
    }
    res.json({ success: true });
  } catch (e) {
    const msg = errorMessageForResponse(e);
    console.error('[Data] deleteKnowledgeCategory error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: msg } });
  }
}

export async function postKnowledgeArticleController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!canManageKnowledge(req)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '仅管理员可操作' } });
      return;
    }
    const body = req.body as {
      category_id?: string;
      /** 标准字段 */
      title_zh?: string;
      /** 与部分前端/旧接口对齐 */
      title?: string;
      title_en?: string | null;
      content?: string | null;
      body?: string | null;
      description?: string | null;
      image_url?: string | null;
      sort_order?: number;
      is_published?: boolean;
      visibility?: 'public' | 'private';
    };
    const titleZh = String(body?.title_zh ?? body?.title ?? '').trim();
    if (!body?.category_id || !titleZh) {
      res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'category_id 与标题（title_zh 或 title）必填' },
      });
      return;
    }
    const tenantId = tenantIdForKnowledgeCreate(req);
    if (!tenantId) {
      res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: '当前账号未绑定租户，无法创建知识库文章' } });
      return;
    }
    const contentRaw = body.content ?? body.body;
    const data = await createKnowledgeArticleRepository({
      tenant_id: tenantId,
      category_id: String(body.category_id).trim(),
      title_zh: titleZh,
      title_en: body.title_en ?? null,
      content: contentRaw != null ? String(contentRaw) : '',
      description: body.description ?? null,
      image_url: body.image_url ?? null,
      sort_order: body.sort_order ?? 1,
      is_published: body.is_published ?? true,
      created_by: req.user?.id ?? null,
      visibility: body.visibility ?? 'private',
    });
    res.status(201).json({ success: true, data });
  } catch (e) {
    const msg = errorMessageForResponse(e);
    console.error('[Data] postKnowledgeArticle error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: msg } });
  }
}

export async function patchKnowledgeArticleController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!canManageKnowledge(req)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '仅管理员可操作' } });
      return;
    }
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
      return;
    }
    const body = req.body as {
      title_zh?: string;
      title?: string;
      title_en?: string | null;
      content?: string | null;
      body?: string | null;
      description?: string | null;
      image_url?: string | null;
      sort_order?: number;
      is_published?: boolean;
      visibility?: 'public' | 'private';
    };
    const tenantId = tenantIdForKnowledgeWriteScope(req);
    if (!tenantId) {
      res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: '当前账号未绑定租户' } });
      return;
    }
    const patch: Parameters<typeof updateKnowledgeArticleRepository>[1] = {};
    if (body.title_zh !== undefined || body.title !== undefined) {
      const t = String(body.title_zh ?? body.title ?? '').trim();
      if (t) patch.title_zh = t;
    }
    if (body.title_en !== undefined) patch.title_en = body.title_en ?? null;
    if (body.content !== undefined || body.body !== undefined) {
      patch.content = body.content ?? body.body ?? '';
    }
    if (body.description !== undefined) patch.description = body.description ?? null;
    if (body.image_url !== undefined) patch.image_url = body.image_url ?? null;
    if (body.sort_order !== undefined) patch.sort_order = body.sort_order;
    if (body.is_published !== undefined) patch.is_published = body.is_published;
    if (body.visibility !== undefined) patch.visibility = body.visibility;
    const data = await updateKnowledgeArticleRepository(id, patch, tenantId);
    if (!data) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Knowledge article not found' } });
      return;
    }
    res.json({ success: true, data });
  } catch (e) {
    const msg = errorMessageForResponse(e);
    console.error('[Data] patchKnowledgeArticle error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: msg } });
  }
}

export async function deleteKnowledgeArticleController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!canManageKnowledge(req)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '仅管理员可操作' } });
      return;
    }
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
      return;
    }
    const tenantId = tenantIdForKnowledgeWriteScope(req);
    if (!tenantId) {
      res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: '当前账号未绑定租户' } });
      return;
    }
    const ok = await deleteKnowledgeArticleRepository(id, tenantId);
    if (!ok) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Knowledge article not found' } });
      return;
    }
    res.json({ success: true });
  } catch (e) {
    const msg = errorMessageForResponse(e);
    console.error('[Data] deleteKnowledgeArticle error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: msg } });
  }
}

export async function getKnowledgeReadStatusController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const employeeId = req.user?.id;
    if (!employeeId) {
      res.json({ success: true, data: [] });
      return;
    }
    const data = await listKnowledgeReadStatusRepository(employeeId);
    res.json({ success: true, data });
  } catch (e) {
    console.error('[Data] getKnowledgeReadStatus error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch knowledge read status' } });
  }
}

export async function getKnowledgeUnreadCountController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const employeeId = req.user?.id;
    if (!employeeId) {
      res.json({ success: true, data: { unreadCount: 0 } });
      return;
    }
    const tenantId = resolveTenantId(req, (req.query.tenant_id as string | undefined) ?? undefined, true);
    const { unreadCount, unreadByCategory } = await getKnowledgeUnreadCountsRepository(
      employeeId,
      tenantId,
    );
    res.json({ success: true, data: { unreadCount, unreadByCategory } });
  } catch (e) {
    console.error('[Data] getKnowledgeUnreadCount error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch knowledge unread count' } });
  }
}

export async function postKnowledgeMarkReadController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const employeeId = req.user?.id;
    const articleId = (req.body as { article_id?: string })?.article_id;
    if (!employeeId || !articleId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'employee and article_id required' } });
      return;
    }
    await markKnowledgeArticleReadRepository(employeeId, articleId);
    res.json({ success: true });
  } catch (e) {
    const msg = errorMessageForResponse(e);
    console.error('[Data] postKnowledgeMarkRead error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: msg } });
  }
}

export async function postKnowledgeMarkAllReadController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const employeeId = req.user?.id;
    if (!employeeId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'employee required' } });
      return;
    }
    const tenantScope = tenantIdForKnowledgeMarkAllReadScope(req);
    if (tenantScope === undefined) {
      res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: '当前账号未绑定租户' } });
      return;
    }
    const count = await markAllKnowledgeArticlesReadRepository(employeeId, tenantScope);
    res.json({ success: true, data: { count } });
  } catch (e) {
    const msg = errorMessageForResponse(e);
    console.error('[Data] postKnowledgeMarkAllRead error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: msg } });
  }
}

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
    const offset = (page - 1) * pageSize;

    // 角色级别过滤：admin 看全部，manager 看下属+自己，staff 只看自己
    const role = req.user?.role ?? 'staff';
    const employeeId = req.user?.id ?? null;

    console.log('[API] getLoginLogs tenant_id=', tenantId || 'all', 'role=', role, 'page=', page, 'pageSize=', pageSize);
    const { rows, total } = await listLoginLogsRepository(pageSize, tenantId, offset, role, employeeId);
    res.json({
      success: true,
      data: { rows, total, page, page_size: pageSize },
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

export async function repairKnowledgeFieldsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'manager' && !req.user?.is_platform_super_admin) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '仅管理员可执行' } });
      return;
    }
    const data = await repairKnowledgeFields();
    res.json({ success: true, data });
  } catch (e) {
    console.error('[Data] repairKnowledgeFields error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: String((e as Error).message) } });
  }
}

export async function seedKnowledgeCategoriesController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'manager' && !req.user?.is_platform_super_admin) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '仅管理员可执行' } });
      return;
    }
    const { query: dbQuery, execute: dbExecute } = await import('../../database/index.js');
    const existing = await dbQuery('SELECT id FROM knowledge_categories LIMIT 1');
    if (existing && existing.length > 0) {
      res.json({ success: true, data: { seeded: false, message: '已有分类，跳过' } });
      return;
    }
    const tenantId = req.user?.tenant_id ?? null;
    const defaults = [
      { name: '公司通知', content_type: 'text', sort_order: 1, visibility: 'public' },
      { name: '行业知识', content_type: 'text', sort_order: 2, visibility: 'public' },
      { name: '兑卡指南', content_type: 'image', sort_order: 3, visibility: 'public' },
      { name: '常用话术', content_type: 'phrase', sort_order: 4, visibility: 'public' },
    ];
    for (const row of defaults) {
      if (tenantId) {
        await dbExecute(
          `INSERT INTO knowledge_categories (name, content_type, sort_order, visibility, tenant_id) VALUES (?, ?, ?, ?, ?)`,
          [row.name, row.content_type, row.sort_order, row.visibility, tenantId]
        );
      } else {
        await dbExecute(
          `INSERT INTO knowledge_categories (name, content_type, sort_order, visibility) VALUES (?, ?, ?, ?)`,
          [row.name, row.content_type, row.sort_order, row.visibility]
        );
      }
    }
    res.json({ success: true, data: { seeded: true, count: 4 } });
  } catch (e) {
    console.error('[Data] seedKnowledgeCategories error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: String((e as Error).message) } });
  }
}

export async function getDataDebugController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (req.user?.type !== 'employee') {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Employee access required' } });
    return;
  }
  try {
    const { query: dbQuery } = await import('../../database/index.js');
    const [opRes, loginRes, catRes] = await Promise.all([
      dbQuery<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM operation_logs'),
      dbQuery<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM employee_login_logs'),
      dbQuery<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM knowledge_categories'),
    ]);
    res.json({
      success: true,
      data: {
        operationLogsCount: Number(opRes[0]?.cnt ?? 0),
        loginLogsCount: Number(loginRes[0]?.cnt ?? 0),
        knowledgeCategoriesCount: Number(catRes[0]?.cnt ?? 0),
      },
    });
  } catch (e) {
    console.error('[Data] getDataDebug error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: String((e as Error).message) } });
  }
}

export async function getIpAccessControlController(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const raw = await getIpAccessControlSettingRepository();
    const data = normalizeIpAccessControl(raw);
    res.json({ success: true, data });
  } catch (e) {
    console.error('[Data] getIpAccessControl error:', e);
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
            ? `访问被拒绝：当前 IP (${clientIp}) 所在地区不在允许列表内。${modeHint}`
            : `访问被拒绝：当前 IP (${clientIp}) 来自受限国家/地区（${loc.country_name || loc.country_code || '未知'}）。${modeHint}`,
      },
    });
  } catch (e) {
    console.error('[Data] getIpCountryCheck error:', e);
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
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '无权查看该配置' } });
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
    console.error('[Data] getSharedData error:', e);
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
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '仅租户管理员可配置员工登录 IP 白名单' } });
      return;
    }
    const { target_tenant_id, tenant_id } = body;
    const { tenantId, delegated } = tenantIdForPlatformDelegatedWrite(req, { target_tenant_id, tenant_id });
    if (!tenantId) {
      res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: '当前账号未绑定租户' } });
      return;
    }
    const payload =
      dataKey === 'copySettings'
        ? mergeCopySettingsWrite(dataValue, await getSharedDataRepository(tenantId, dataKey))
        : sanitizeSharedDataPayload(dataKey, dataValue);
    const ok = await upsertSharedDataRepository(tenantId, dataKey, payload);
    if (delegated) {
      console.log(
        `[Data] platform delegation: postSharedData key=${dataKey} → tenant_id=${tenantId} by ${req.user?.id ?? ''}`,
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
    console.error('[Data] postSharedData error:', e);
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
    console.error('[Data] getSharedDataBatch error:', e);
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
    console.error('[Data] getActivityData error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch activity data' } });
  }
}

export async function getSpinCreditsDetailController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const memberId = req.params.memberId;
    if (!memberId) { res.status(400).json({ success: false, error: 'INVALID_PARAMS' }); return; }
    const { getSpinCreditsDetailRepository } = await import('./repository.js');
    const data = await getSpinCreditsDetailRepository(memberId);
    res.json({ success: true, ...data });
  } catch (e) {
    console.error('[Data] getSpinCreditsDetail:', e);
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
    console.error('[Data] patchActivityGift error:', e);
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
    console.error('[Data] deleteActivityGift error:', e);
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
    console.error('[Data] getActivityDataRetention error:', e);
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
    console.error('[Data] putActivityDataRetention error:', e);
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
    console.error('[Data] postActivityDataRetentionRun error:', e);
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
    console.error('[Data] postActivityDataRetentionPurgeAll error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to purge all activity data' } });
  }
}
