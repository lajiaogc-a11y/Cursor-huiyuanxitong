/**
 * Data Controller - 操作日志、公司文档 API
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import {
  listOperationLogsRepository,
  insertOperationLogRepository,
  listKnowledgeCategoriesRepository,
  listKnowledgeArticlesRepository,
  listKnowledgeReadStatusRepository,
  getKnowledgeUnreadCountRepository,
  markKnowledgeArticleReadRepository,
  markAllKnowledgeArticlesReadRepository,
  listLoginLogsRepository,
  listRolePermissionsRepository,
  getIpAccessControlSettingRepository,
  getNavigationConfigRepository,
  upsertNavigationConfigRepository,
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
} from './repository.js';

function resolveTenantId(
  req: AuthenticatedRequest,
  requestedTenantId?: string | null,
  allowPlatformAll = false
): string | null | undefined {
  if (req.user?.is_platform_super_admin) {
    if (requestedTenantId) return requestedTenantId;
    return allowPlatformAll ? null : null;
  }
  return req.user?.tenant_id ?? null;
}

function canManageKnowledge(req: AuthenticatedRequest): boolean {
  return !!(req.user?.is_platform_super_admin || req.user?.role === 'admin' || req.user?.role === 'manager');
}

export async function getOperationLogsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const isPlatform = !!req.user?.is_platform_super_admin;
    const queryTenantId = req.query.tenant_id as string | undefined;
    const tenantId = isPlatform && queryTenantId
      ? queryTenantId
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
    const { data, count } = await listOperationLogsRepository({
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
    });

    const logs = data.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      operatorId: r.operator_id,
      operatorAccount: r.operator_account,
      operatorRole: r.operator_role,
      module: r.module,
      operationType: r.operation_type,
      objectId: r.object_id,
      objectDescription: r.object_description,
      beforeData: r.before_data,
      afterData: r.after_data,
      ipAddress: r.ip_address,
      isRestored: r.is_restored,
      restoredBy: r.restored_by,
      restoredAt: r.restored_at,
    }));

    res.json({ success: true, data: { logs, totalCount: count } });
  } catch (e) {
    console.error('[Data] getOperationLogs error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch operation logs' } });
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
    const isPlatformSuperAdmin = !!req.user?.is_platform_super_admin;
    console.log('[API] getKnowledgeCategories tenant_id=', tenantId || 'all');
    const employeeId = req.user?.id;

    const data = await listKnowledgeCategoriesRepository(tenantId, employeeId, isPlatformSuperAdmin);
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
    const isPlatformSuperAdmin = !!req.user?.is_platform_super_admin;
    const employeeId = req.user?.id;

    const data = await listKnowledgeArticlesRepository(categoryId, tenantId, employeeId, isPlatformSuperAdmin);
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
      created_by?: string | null;
      tenant_id?: string;
    };
    if (!body?.name || !body?.content_type) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name and content_type required' } });
      return;
    }
    const tenantId = resolveTenantId(req, body.tenant_id);
    const data = await createKnowledgeCategoryRepository({
      tenant_id: tenantId ?? null,
      name: body.name,
      content_type: body.content_type,
      sort_order: body.sort_order ?? 1,
      visibility: body.visibility ?? 'private',
      created_by: body.created_by ?? req.user?.id ?? null,
    });
    res.status(201).json({ success: true, data });
  } catch (e) {
    console.error('[Data] postKnowledgeCategory error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create knowledge category' } });
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
    const body = req.body as { tenant_id?: string; name?: string; content_type?: 'text' | 'phrase' | 'image'; sort_order?: number; visibility?: 'public' | 'private'; is_active?: boolean };
    const tenantId = resolveTenantId(req, body.tenant_id);
    const data = await updateKnowledgeCategoryRepository(id, body, tenantId);
    if (!data) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Knowledge category not found' } });
      return;
    }
    res.json({ success: true, data });
  } catch (e) {
    console.error('[Data] patchKnowledgeCategory error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update knowledge category' } });
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
    const tenantId = resolveTenantId(req, ((req.body as { tenant_id?: string } | undefined)?.tenant_id) ?? (req.query.tenant_id as string | undefined));
    const ok = await deleteKnowledgeCategoryRepository(id, tenantId);
    if (!ok) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Knowledge category not found' } });
      return;
    }
    res.json({ success: true });
  } catch (e) {
    console.error('[Data] deleteKnowledgeCategory error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete knowledge category' } });
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
      title_zh?: string;
      title_en?: string | null;
      content?: string | null;
      description?: string | null;
      image_url?: string | null;
      sort_order?: number;
      is_published?: boolean;
      visibility?: 'public' | 'private';
      tenant_id?: string;
    };
    if (!body?.category_id || !body?.title_zh) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'category_id and title_zh required' } });
      return;
    }
    const tenantId = resolveTenantId(req, body.tenant_id);
    const data = await createKnowledgeArticleRepository({
      tenant_id: tenantId ?? null,
      category_id: body.category_id,
      title_zh: body.title_zh,
      title_en: body.title_en ?? null,
      content: body.content ?? null,
      description: body.description ?? null,
      image_url: body.image_url ?? null,
      sort_order: body.sort_order ?? 1,
      is_published: body.is_published ?? true,
      created_by: req.user?.id ?? null,
      visibility: body.visibility ?? 'private',
    });
    res.status(201).json({ success: true, data });
  } catch (e) {
    console.error('[Data] postKnowledgeArticle error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to create knowledge article' } });
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
    const body = req.body as { tenant_id?: string; title_zh?: string; title_en?: string | null; content?: string | null; description?: string | null; image_url?: string | null; sort_order?: number; is_published?: boolean; visibility?: 'public' | 'private' };
    const tenantId = resolveTenantId(req, body.tenant_id);
    const data = await updateKnowledgeArticleRepository(id, body, tenantId);
    if (!data) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Knowledge article not found' } });
      return;
    }
    res.json({ success: true, data });
  } catch (e) {
    console.error('[Data] patchKnowledgeArticle error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to update knowledge article' } });
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
    const tenantId = resolveTenantId(req, ((req.body as { tenant_id?: string } | undefined)?.tenant_id) ?? (req.query.tenant_id as string | undefined));
    const ok = await deleteKnowledgeArticleRepository(id, tenantId);
    if (!ok) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Knowledge article not found' } });
      return;
    }
    res.json({ success: true });
  } catch (e) {
    console.error('[Data] deleteKnowledgeArticle error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to delete knowledge article' } });
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
    const unreadCount = await getKnowledgeUnreadCountRepository(employeeId, tenantId);
    res.json({ success: true, data: { unreadCount } });
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
    console.error('[Data] postKnowledgeMarkRead error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to mark knowledge article as read' } });
  }
}

export async function postKnowledgeMarkAllReadController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const employeeId = req.user?.id;
    if (!employeeId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'employee required' } });
      return;
    }
    const tenantId = resolveTenantId(
      req,
      (((req.body as { tenant_id?: string })?.tenant_id) ?? (req.query.tenant_id as string | undefined)) ?? undefined,
      true
    );
    const count = await markAllKnowledgeArticlesReadRepository(employeeId, tenantId);
    res.json({ success: true, data: { count } });
  } catch (e) {
    console.error('[Data] postKnowledgeMarkAllRead error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to mark all knowledge articles as read' } });
  }
}

export async function getLoginLogsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const isPlatform = !!req.user?.is_platform_super_admin;
    const queryTenantId = req.query.tenant_id as string | undefined;
    const tenantId = isPlatform && queryTenantId
      ? queryTenantId
      : (req.user?.tenant_id ?? null);
    console.log('[API] getLoginLogs tenant_id=', tenantId || 'all');
    const limit = Math.min(parseInt(String(req.query.limit || 500), 10), 1000);
    const data = await listLoginLogsRepository(limit, tenantId);
    res.json({ success: true, data });
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
    const queryTenantId = req.query.tenant_id as string | undefined;
    const tenantId = isPlatform && queryTenantId
      ? queryTenantId
      : (req.user?.tenant_id ?? null);
    const page = parseInt(String(req.query.page || 1), 10);
    const pageSize = parseInt(String(req.query.pageSize || 50), 10);
    const status = req.query.status as string | undefined;
    const dateFrom = req.query.dateFrom as string | undefined;
    const dateTo = req.query.dateTo as string | undefined;
    const { data, count } = await listAuditRecordsRepository({
      page,
      pageSize,
      status,
      dateFrom,
      dateTo,
      tenantId,
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
    const queryTenantId = req.query.tenant_id as string | undefined;
    const tenantId = isPlatform && queryTenantId
      ? queryTenantId
      : (req.user?.tenant_id ?? null);
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

export async function seedKnowledgeCategoriesController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const role = req.user?.role;
    if (role !== 'admin' && role !== 'manager' && !req.user?.is_platform_super_admin) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: '仅管理员可执行' } });
      return;
    }
    const { supabaseAdmin } = await import('../../database/index.js');
    const { data: existing } = await supabaseAdmin.from('knowledge_categories').select('id').limit(1);
    if (existing && existing.length > 0) {
      res.json({ success: true, data: { seeded: false, message: '已有分类，跳过' } });
      return;
    }
    // 优先使用 RPC（SECURITY DEFINER 绕过 tenant_id 等约束）
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('rpc_seed_knowledge_categories');
    if (!rpcError && rpcResult) {
      const r = rpcResult as { seeded?: boolean; count?: number; message?: string };
      return void res.json({ success: true, data: { seeded: r.seeded ?? true, count: r.count ?? 4, message: r.message } });
    }
    // RPC 不存在时回退到直接插入
    const tenantId = req.user?.tenant_id ?? null;
    const baseRow = tenantId ? { tenant_id: tenantId } : {};
    const defaults = [
      { ...baseRow, name: '公司通知', content_type: 'text', sort_order: 1, visibility: 'public' },
      { ...baseRow, name: '行业知识', content_type: 'text', sort_order: 2, visibility: 'public' },
      { ...baseRow, name: '兑卡指南', content_type: 'image', sort_order: 3, visibility: 'public' },
      { ...baseRow, name: '常用话术', content_type: 'phrase', sort_order: 4, visibility: 'public' },
    ];
    const { error } = await supabaseAdmin.from('knowledge_categories').insert(defaults);
    if (error) throw error;
    res.json({ success: true, data: { seeded: true, count: 4 } });
  } catch (e) {
    console.error('[Data] seedKnowledgeCategories error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: String((e as Error).message) } });
  }
}

export async function getDataDebugController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { supabaseAdmin } = await import('../../database/index.js');
    const [opRes, loginRes, catRes] = await Promise.all([
      supabaseAdmin.from('operation_logs').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('employee_login_logs').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('knowledge_categories').select('id', { count: 'exact', head: true }),
    ]);
    res.json({
      success: true,
      data: {
        operationLogsCount: opRes.count ?? 0,
        loginLogsCount: loginRes.count ?? 0,
        knowledgeCategoriesCount: catRes.count ?? 0,
      },
    });
  } catch (e) {
    console.error('[Data] getDataDebug error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: String((e as Error).message) } });
  }
}

export async function getIpAccessControlController(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const config = await getIpAccessControlSettingRepository();
    res.json({ success: true, data: config ?? { enabled: false } });
  } catch (e) {
    console.error('[Data] getIpAccessControl error:', e);
    res.json({ success: true, data: { enabled: false } });
  }
}

export async function getNavigationConfigController(_req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const data = await getNavigationConfigRepository();
    res.json({ success: true, data });
  } catch (e) {
    console.error('[Data] getNavigationConfig error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch navigation config' } });
  }
}

export async function postNavigationConfigController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const body = req.body as { items?: Array<{ nav_key: string; display_text_zh: string; display_text_en: string; is_visible: boolean; sort_order: number }> };
    const items = Array.isArray(body?.items) ? body.items : [];
    await upsertNavigationConfigRepository(items);
    res.json({ success: true });
  } catch (e) {
    console.error('[Data] postNavigationConfig error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to save navigation config' } });
  }
}

export async function getSharedDataController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const queryTenantId = req.query.tenant_id as string | undefined;
    const dataKey = req.query.data_key as string;
    if (!dataKey) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'data_key required' } });
      return;
    }
    const tenantId = resolveTenantId(req, queryTenantId);
    if (!tenantId) {
      res.json({ success: true, data: null });
      return;
    }
    const data = await getSharedDataRepository(tenantId, dataKey);
    res.json({ success: true, data });
  } catch (e) {
    console.error('[Data] getSharedData error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch shared data' } });
  }
}

export async function postSharedDataController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const body = req.body as { data_key?: string; data_value?: unknown; tenant_id?: string };
    const dataKey = body?.data_key ?? (req.query.data_key as string);
    const dataValue = body?.data_value;
    const queryTenantId = body?.tenant_id ?? (req.query.tenant_id as string);
    if (!dataKey) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'data_key required' } });
      return;
    }
    const tenantId = resolveTenantId(req, queryTenantId);
    if (!tenantId) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'tenant_id required' } });
      return;
    }
    const ok = await upsertSharedDataRepository(tenantId, dataKey, dataValue);
    res.json({ success: ok });
  } catch (e) {
    console.error('[Data] postSharedData error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to save shared data' } });
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
    res.json({ success: true, data });
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
      res.json({ success: true, data: { gifts: [], referrals: [], memberActivities: [], pointsLedgerData: [], pointsAccountsData: [] } });
      return;
    }
    const data = await listActivityDataRepository(tenantId);
    res.json({ success: true, data });
  } catch (e) {
    console.error('[Data] getActivityData error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch activity data' } });
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
