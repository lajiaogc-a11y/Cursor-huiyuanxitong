/**
 * Data controllers — knowledge base
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import {
  listKnowledgeReadStatusRepository,
  getKnowledgeUnreadCountRepository,
  getKnowledgeUnreadCountsRepository,
  markKnowledgeArticleReadRepository,
  markAllKnowledgeArticlesReadRepository,
  createKnowledgeCategoryRepository,
  updateKnowledgeCategoryRepository,
  deleteKnowledgeCategoryRepository,
  createKnowledgeArticleRepository,
  updateKnowledgeArticleRepository,
  deleteKnowledgeArticleRepository,
} from './repository.js';
import { listKnowledgeCategories, listKnowledgeArticles } from '../knowledge/service.js';
import {
  resolveTenantId,
  tenantIdForKnowledgeCreate,
  tenantIdForKnowledgeWriteScope,
  clientIpForAudit,
  tenantIdForPlatformDelegatedWrite,
  mergeCopySettingsWrite,
  sanitizeSharedDataPayload,
  auditPlatformDelegation,
  tenantIdForKnowledgeMarkAllReadScope,
  errorMessageForResponse,
  canManageKnowledge,
} from './dataControllerShared.js';

export async function getKnowledgeCategoriesController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const tenantId = resolveTenantId(req, (req.query.tenant_id as string | undefined) ?? undefined, true);
    console.log('[API] getKnowledgeCategories tenant_id=', tenantId || 'all');

    const viewerEmployeeId = req.user?.type === 'employee' ? req.user.id : null;
    const data = await listKnowledgeCategories(tenantId, viewerEmployeeId);
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

    const data = await listKnowledgeArticles(categoryId, tenantId, employeeId ?? null);
    res.json({ success: true, data });
  } catch (e) {
    console.error('[Data] getKnowledgeArticles error:', e);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch knowledge articles' } });
  }
}

export async function postKnowledgeCategoryController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!canManageKnowledge(req)) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
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
      res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'Account not bound to a tenant; cannot create knowledge category' } });
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
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
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
      res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'Account not bound to a tenant' } });
      return;
    }
    const data = await updateKnowledgeCategoryRepository(id, categoryPatch, tenantId);
    if (!data) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Category not found or not in current tenant scope (platform admins: select a target tenant before editing)',
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
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
      return;
    }
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
      return;
    }
    const tenantId = tenantIdForKnowledgeWriteScope(req);
    if (!tenantId) {
      res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'Account not bound to a tenant' } });
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
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
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
        error: { code: 'VALIDATION_ERROR', message: 'category_id and title (title_zh or title) are required' },
      });
      return;
    }
    const tenantId = tenantIdForKnowledgeCreate(req);
    if (!tenantId) {
      res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'Account not bound to a tenant; cannot create knowledge article' } });
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
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
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
      res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'Account not bound to a tenant' } });
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
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } });
      return;
    }
    const id = req.params.id;
    if (!id) {
      res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
      return;
    }
    const tenantId = tenantIdForKnowledgeWriteScope(req);
    if (!tenantId) {
      res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'Account not bound to a tenant' } });
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
      res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'Account not bound to a tenant' } });
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

