import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { apiPost } from '@/api/client';
import { ApiError } from '@/lib/apiClient';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantView } from '@/contexts/TenantViewContext';
import { notify } from "@/lib/notifyHub";
import { logOperationToDb } from './useOperationLogs';
import { useLanguage } from '@/contexts/LanguageContext';
import { compressImageToUploadableFile } from '@/lib/imageClientCompress';
import {
  getKnowledgeCategories,
  createKnowledgeCategory,
  updateKnowledgeCategory,
  deleteKnowledgeCategory,
  getKnowledgeArticles,
  createKnowledgeArticle,
  postKnowledgeMarkRead,
  updateKnowledgeArticle,
  deleteKnowledgeArticle,
  getKnowledgeUnreadCount,
  postKnowledgeMarkAllRead,
  getKnowledgeReadStatus,
} from '@/services/staff/dataApi';
import { logger } from '@/lib/logger';

export interface KnowledgeCategory {
  id: string;
  name: string;
  content_type: 'text' | 'phrase' | 'image';
  sort_order: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  visibility: 'public' | 'private';
}

export interface KnowledgeArticle {
  id: string;
  category_id: string;
  title_zh: string;
  title_en: string | null;
  content: string | null;
  description: string | null;
  image_url: string | null;
  sort_order: number;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  visibility: 'public' | 'private';
}

export interface KnowledgeReadStatus {
  id: string;
  employee_id: string;
  article_id: string;
  read_at: string;
}

export function useKnowledgeCategories(
  currentEmployeeId?: string,
  isSuperAdmin?: boolean,
  isPlatformSuperAdmin?: boolean
) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const { viewingTenantId } = useTenantView() || {};
  const { employee } = useAuth();
  const effectiveTenantId = employee?.is_platform_super_admin
    ? (viewingTenantId || null)
    : (viewingTenantId || employee?.tenant_id || null);

  const { data: categories = [], isLoading: loading, isError: isErrorCategories } = useQuery({
    queryKey: ['knowledge-categories', currentEmployeeId, isSuperAdmin, isPlatformSuperAdmin, viewingTenantId ?? ''],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const data = await getKnowledgeCategories(viewingTenantId || undefined);
      const list = (data || []) as Array<KnowledgeCategory & { is_active?: boolean }>;
      return list.filter((r) => r.is_active !== false) as KnowledgeCategory[];
    },
  });

  // Account switch handler
  useEffect(() => {
    const handleUserSynced = () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-categories'] });
    };
    window.addEventListener('userDataSynced', handleUserSynced);
    return () => window.removeEventListener('userDataSynced', handleUserSynced);
  }, [queryClient]);

  const fetchCategories = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['knowledge-categories', currentEmployeeId, isSuperAdmin, isPlatformSuperAdmin, viewingTenantId ?? ''] });
  }, [queryClient, currentEmployeeId, isSuperAdmin, isPlatformSuperAdmin, viewingTenantId]);

  const addCategory = async (
    name: string, 
    contentType: 'text' | 'phrase' | 'image',
    visibility: 'public' | 'private' = 'public',
    createdBy?: string
  ) => {
    try {
      const maxOrder = categories.reduce((max, c) => Math.max(max, c.sort_order), 0);
      const finalVisibility = visibility;
      const data = await createKnowledgeCategory({
        name,
        content_type: contentType,
        sort_order: maxOrder + 1,
        visibility: finalVisibility,
        created_by: createdBy || currentEmployeeId || null,
        tenant_id: effectiveTenantId,
      });
      if (!data) throw new Error('create category failed');
      
      await logOperationToDb(
        'knowledge_base',
        'create',
        (data?.id as string | null) ?? null,
        null,
        { name, content_type: contentType, visibility: finalVisibility },
        `新增分类: ${name} (${finalVisibility === 'private' ? '私有' : '公开'})`
      );
      
      notify.success(finalVisibility === 'private' ? t('私有分类添加成功', 'Private category added') : t('分类添加成功', 'Category added'));
      fetchCategories();
      return true;
    } catch (error) {
      logger.error('Error adding category:', error);
      notify.error(t('添加失败', 'Failed to add'));
      return false;
    }
  };

  const updateCategory = async (id: string, updates: Partial<KnowledgeCategory>) => {
    try {
      const currentCategory = categories.find(c => c.id === id);
      const data = await updateKnowledgeCategory(id, { ...updates, tenant_id: effectiveTenantId });
      if (!data) throw new Error('update category failed');
      
      await logOperationToDb(
        'knowledge_base',
        'update',
        id,
        currentCategory ? { name: currentCategory.name, content_type: currentCategory.content_type } : null,
        updates,
        `编辑分类: ${currentCategory?.name || id}`
      );
      
      notify.success(t('分类更新成功', 'Category updated'));
      fetchCategories();
      return true;
    } catch (error) {
      logger.error('Error updating category:', error);
      const msg =
        error instanceof ApiError && error.message
          ? error.message
          : t('更新失败', 'Failed to update');
      notify.error(msg);
      return false;
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      const currentCategory = categories.find(c => c.id === id);
      const ok = await deleteKnowledgeCategory(id, effectiveTenantId);
      if (!ok) throw new Error('delete category failed');
      
      await logOperationToDb(
        'knowledge_base',
        'delete',
        id,
        currentCategory ? { name: currentCategory.name, content_type: currentCategory.content_type } : null,
        null,
        `删除分类: ${currentCategory?.name || id}`
      );
      
      notify.success(t('分类删除成功', 'Category deleted'));
      fetchCategories();
      return true;
    } catch (error) {
      logger.error('Error deleting category:', error);
      notify.error(t('删除失败', 'Failed to delete'));
      return false;
    }
  };

  const reorderCategories = async (newOrderedCategories: KnowledgeCategory[]) => {
    try {
      const beforeOrder = categories.map(c => c.name);
      
      for (let i = 0; i < newOrderedCategories.length; i++) {
        const ok = await updateKnowledgeCategory(newOrderedCategories[i].id, {
          sort_order: i + 1,
          tenant_id: effectiveTenantId,
        });
        if (!ok) throw new Error('reorder category failed');
      }
      
      await logOperationToDb(
        'knowledge_base',
        'update',
        null,
        { order: beforeOrder },
        { order: newOrderedCategories.map(c => c.name) },
        `调整分类顺序`
      );
      
      notify.success(t('分类顺序已更新', 'Category order updated'));
      fetchCategories();
      return true;
    } catch (error) {
      logger.error('Error reordering categories:', error);
      notify.error(t('排序更新失败', 'Failed to update order'));
      return false;
    }
  };

  return { categories, loading, isError: isErrorCategories, fetchCategories, addCategory, updateCategory, deleteCategory, reorderCategories };
}

export function useKnowledgeArticles(
  categoryId?: string,
  currentEmployeeId?: string,
  isSuperAdmin?: boolean,
  isPlatformSuperAdmin?: boolean
) {
  const queryClient = useQueryClient();
  const { t } = useLanguage();
  const { viewingTenantId } = useTenantView() || {};
  const { employee } = useAuth();
  const effectiveTenantId = employee?.is_platform_super_admin
    ? (viewingTenantId || null)
    : (viewingTenantId || employee?.tenant_id || null);

  const { data: articles = [], isLoading: loading, isPlaceholderData } = useQuery({
    queryKey: ['knowledge-articles', categoryId, currentEmployeeId, isSuperAdmin, isPlatformSuperAdmin, viewingTenantId ?? ''],
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      if (!categoryId) return [];
      const data = await getKnowledgeArticles(categoryId, viewingTenantId || undefined);
      return ((data || []) as KnowledgeArticle[]).filter((a) => a.is_published).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    },
  });

  const fetchArticles = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['knowledge-articles', categoryId, currentEmployeeId, isSuperAdmin, isPlatformSuperAdmin, viewingTenantId ?? ''] });
  }, [queryClient, categoryId, currentEmployeeId, isSuperAdmin, isPlatformSuperAdmin, viewingTenantId]);

  const addArticle = async (article: Omit<KnowledgeArticle, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => {
    try {
      const data = await createKnowledgeArticle({ ...article, tenant_id: effectiveTenantId });
      if (!data) throw new Error('create article failed');
      
      await logOperationToDb(
        'knowledge_base',
        'create',
        (data?.id as string) || null,
        null,
        { title_zh: article.title_zh, title_en: article.title_en, content: article.content?.substring(0, 100) },
        `新增文章: ${article.title_zh}`
      );
      
      // Auto-mark as read for the creator
      if (data?.id && currentEmployeeId) {
        try {
          await postKnowledgeMarkRead(String(data.id));
        } catch (e) {
          logger.warn('Auto-mark read failed:', e);
        }
      }
      
      notify.success(t('内容发布成功', 'Content published'));
      fetchArticles();
      return true;
    } catch (error) {
      logger.error('Error adding article:', error);
      notify.error(t('发布失败', 'Failed to publish'));
      return false;
    }
  };

  const updateArticle = async (id: string, updates: Partial<KnowledgeArticle>) => {
    try {
      const currentArticle = articles.find(a => a.id === id);
      const data = await updateKnowledgeArticle(id, { ...updates, tenant_id: effectiveTenantId });
      if (!data) throw new Error('update article failed');
      
      await logOperationToDb(
        'knowledge_base',
        'update',
        id,
        currentArticle ? { title_zh: currentArticle.title_zh, title_en: currentArticle.title_en, content: currentArticle.content?.substring(0, 100) } : null,
        { title_zh: updates.title_zh, title_en: updates.title_en, content: updates.content?.substring(0, 100) },
        `编辑文章: ${currentArticle?.title_zh || updates.title_zh || id}`
      );
      
      notify.success(t('内容更新成功', 'Content updated'));
      fetchArticles();
      return true;
    } catch (error) {
      logger.error('Error updating article:', error);
      notify.error(t('更新失败', 'Failed to update'));
      return false;
    }
  };

  const deleteArticle = async (id: string) => {
    try {
      const currentArticle = articles.find(a => a.id === id);
      const ok = await deleteKnowledgeArticle(id, effectiveTenantId);
      if (!ok) throw new Error('delete article failed');
      
      await logOperationToDb(
        'knowledge_base',
        'delete',
        id,
        currentArticle ? { title_zh: currentArticle.title_zh, title_en: currentArticle.title_en, content: currentArticle.content?.substring(0, 100) } : null,
        null,
        `删除文章: ${currentArticle?.title_zh || id}`
      );
      
      notify.success(t('内容删除成功', 'Content deleted'));
      fetchArticles();
      return true;
    } catch (error) {
      logger.error('Error deleting article:', error);
      notify.error(t('删除失败', 'Failed to delete'));
      return false;
    }
  };

  const updateArticleSortOrders = async (updates: { id: string; sort_order: number }[]) => {
    try {
      for (const update of updates) {
        const ok = await updateKnowledgeArticle(update.id, { sort_order: update.sort_order, tenant_id: effectiveTenantId });
        if (!ok) throw new Error('reorder article failed');
      }
      
      await logOperationToDb(
        'knowledge_base',
        'update',
        null,
        null,
        { updated_count: updates.length },
        `批量更新文章排序: ${updates.length} 条`
      );
      
      fetchArticles();
      return true;
    } catch (error) {
      logger.error('Error updating sort orders:', error);
      notify.error(t('排序更新失败', 'Failed to update order'));
      return false;
    }
  };

  return { articles, loading: loading || isPlaceholderData, fetchArticles, addArticle, updateArticle, deleteArticle, updateArticleSortOrders };
}

export function useUnreadCount() {
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadByCategory, setUnreadByCategory] = useState<Record<string, number>>({});
  const effectiveTenantId = employee?.is_platform_super_admin
    ? (viewingTenantId || null)
    : (viewingTenantId || employee?.tenant_id || null);

  const fetchUnreadCount = useCallback(async () => {
    if (!employee?.id) return;

    try {
      const { unreadCount: n, unreadByCategory: byCat } = await getKnowledgeUnreadCount(effectiveTenantId);
      setUnreadCount(n);
      setUnreadByCategory(byCat || {});
    } catch (error) {
      logger.error('Error fetching unread count:', error);
    }
  }, [employee?.id, effectiveTenantId]);

  useEffect(() => {
    fetchUnreadCount();

    /** 与 markAsRead 联动：以服务端未读数为准，避免本地 -1 与接口不一致或重复扣减 */
    const handleReadUpdate = () => {
      void fetchUnreadCount();
    };
    window.addEventListener('knowledge-read-update', handleReadUpdate);

    const timer = setInterval(() => {
      fetchUnreadCount();
    }, 30000);

    return () => {
      window.removeEventListener('knowledge-read-update', handleReadUpdate);
      clearInterval(timer);
    };
  }, [fetchUnreadCount, employee?.id]);

  const markAsRead = async (articleId: string, categoryId?: string) => {
    if (!employee?.id) return;

    try {
      const ok = await postKnowledgeMarkRead(articleId);
      if (!ok) throw new Error('mark read failed');
      setUnreadCount((c) => Math.max(0, c - 1));
      if (categoryId) {
        const k = String(categoryId);
        setUnreadByCategory((prev) => {
          const cur = prev[k] ?? 0;
          if (cur <= 0) return prev;
          const next = { ...prev, [k]: cur - 1 };
          if (next[k] <= 0) delete next[k];
          return next;
        });
      }
      /** 携带 articleId：列表/详情可立即去掉「未读」样式，再与未读数接口对齐 */
      window.dispatchEvent(
        new CustomEvent('knowledge-read-update', {
          detail: { articleId: String(articleId), categoryId: categoryId ? String(categoryId) : undefined },
        }),
      );
    } catch (error) {
      logger.error('Error marking as read:', error);
    }
  };

  const markAllAsRead = async (): Promise<boolean> => {
    if (!employee?.id) return false;

    try {
      await postKnowledgeMarkAllRead(effectiveTenantId);
      setUnreadCount(0);
      setUnreadByCategory({});
      window.dispatchEvent(new CustomEvent('knowledge-read-update'));
      return true;
    } catch (error) {
      logger.error('Error marking all as read:', error);
      return false;
    }
  };

  return { unreadCount, unreadByCategory, fetchUnreadCount, markAsRead, markAllAsRead };
}

// 🔧 新增：文章已读状态 hook，用于在列表中标记未读文章
export function useArticleReadStatus() {
  const { employee } = useAuth();
  const [readArticleIds, setReadArticleIds] = useState<Set<string>>(new Set());

  const fetchReadStatus = useCallback(async () => {
    if (!employee?.id) return;
    const data = await getKnowledgeReadStatus();
    setReadArticleIds(new Set((data || []).map((id) => String(id))));
  }, [employee?.id]);

  useEffect(() => {
    fetchReadStatus();
    const timer = setInterval(() => {
      fetchReadStatus();
    }, 30000);
    const onReadSync = (ev: Event) => {
      const aid = (ev as CustomEvent<{ articleId?: string }>).detail?.articleId;
      if (aid) {
        setReadArticleIds((prev) => {
          const next = new Set(prev);
          next.add(String(aid));
          return next;
        });
      }
      void fetchReadStatus();
    };
    window.addEventListener('knowledge-read-update', onReadSync);
    return () => {
      clearInterval(timer);
      window.removeEventListener('knowledge-read-update', onReadSync);
    };
  }, [fetchReadStatus]);

  return { readArticleIds, refetch: fetchReadStatus };
}

export async function uploadKnowledgeImage(file: File): Promise<string | null> {
  try {
    // Validate file size (max 10MB before compression)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      notify.error('图片大小不能超过 10MB / Image must be under 10MB');
      return null;
    }

    const compressed = await compressImageToUploadableFile(file, {
      maxDimension: 1920,
      quality: 0.85,
      outputName: `kb-${Date.now()}`,
    });

    const ratio = ((1 - compressed.size / file.size) * 100).toFixed(0);
    logger.log(
      `[Image] Compressed ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB (${ratio}% smaller)`
    );

    const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
    if (compressed.size > MAX_UPLOAD_BYTES) {
      notify.error('压缩后图片仍超过 2MB / Image still exceeds 2MB after compression');
      return null;
    }

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('read failed'));
      reader.readAsDataURL(compressed);
    });

    const resp = await apiPost<{ success?: boolean; url?: string; error?: string; message?: string }>(
      '/api/upload/image',
      {
        data: dataUrl,
        content_type: compressed.type,
        file_name: compressed.name,
      }
    );

    if (!resp || (resp as { success?: boolean }).success === false || !(resp as { url?: string }).url) {
      const msg = (resp as { message?: string })?.message || (resp as { error?: string })?.error || 'upload failed';
      throw new Error(msg);
    }

    return (resp as { url: string }).url;
  } catch (error) {
    logger.error('Error uploading image:', error);
    notify.error('图片上传失败 / Image upload failed');
    return null;
  }
}
