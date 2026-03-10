import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantView } from '@/contexts/TenantViewContext';
import { toast } from 'sonner';
import { logOperationToDb } from './useOperationLogs';
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

export function useKnowledgeCategories(currentEmployeeId?: string, isSuperAdmin?: boolean) {
  const queryClient = useQueryClient();
  const { viewingTenantId } = useTenantView() || {};

  const { data: categories = [], isLoading: loading } = useQuery({
    queryKey: ['knowledge-categories', currentEmployeeId, isSuperAdmin, viewingTenantId ?? ''],
    queryFn: async () => {
      if (viewingTenantId) {
        const { data, error } = await supabase.rpc('platform_get_tenant_knowledge_categories', {
          p_tenant_id: viewingTenantId,
        });
        if (error) throw error;
        return (data || []) as KnowledgeCategory[];
      }
      const { data, error } = await supabase
        .from('knowledge_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');

      if (error) throw error;
      
      return (data || []).filter((cat: any) => {
        if (isSuperAdmin) return true;
        if (cat.visibility === 'public') return true;
        if (cat.created_by === currentEmployeeId) return true;
        return false;
      }) as KnowledgeCategory[];
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
    queryClient.invalidateQueries({ queryKey: ['knowledge-categories', currentEmployeeId, isSuperAdmin, viewingTenantId ?? ''] });
  }, [queryClient, currentEmployeeId, isSuperAdmin, viewingTenantId]);

  const addCategory = async (
    name: string, 
    contentType: 'text' | 'phrase' | 'image',
    visibility: 'public' | 'private' = 'private',
    createdBy?: string
  ) => {
    try {
      const maxOrder = categories.reduce((max, c) => Math.max(max, c.sort_order), 0);
      const finalVisibility = isSuperAdmin ? visibility : 'private';
      
      const { data, error } = await supabase
        .from('knowledge_categories')
        .insert({
          name,
          content_type: contentType,
          sort_order: maxOrder + 1,
          visibility: finalVisibility,
          created_by: createdBy || currentEmployeeId,
        })
        .select()
        .single();

      if (error) throw error;
      
      await logOperationToDb(
        'knowledge_base',
        'create',
        data?.id || null,
        null,
        { name, content_type: contentType, visibility: finalVisibility },
        `新增分类: ${name} (${finalVisibility === 'private' ? '私有' : '公开'})`
      );
      
      toast.success(finalVisibility === 'private' ? '私有分类添加成功' : '分类添加成功');
      fetchCategories();
      return true;
    } catch (error) {
      console.error('Error adding category:', error);
      toast.error('添加失败');
      return false;
    }
  };

  const updateCategory = async (id: string, updates: Partial<KnowledgeCategory>) => {
    try {
      const currentCategory = categories.find(c => c.id === id);
      
      const { error } = await supabase
        .from('knowledge_categories')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
      
      await logOperationToDb(
        'knowledge_base',
        'update',
        id,
        currentCategory ? { name: currentCategory.name, content_type: currentCategory.content_type } : null,
        updates,
        `编辑分类: ${currentCategory?.name || id}`
      );
      
      toast.success('分类更新成功');
      fetchCategories();
      return true;
    } catch (error) {
      console.error('Error updating category:', error);
      toast.error('更新失败');
      return false;
    }
  };

  const deleteCategory = async (id: string) => {
    try {
      const currentCategory = categories.find(c => c.id === id);
      
      const { error } = await supabase
        .from('knowledge_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      await logOperationToDb(
        'knowledge_base',
        'delete',
        id,
        currentCategory ? { name: currentCategory.name, content_type: currentCategory.content_type } : null,
        null,
        `删除分类: ${currentCategory?.name || id}`
      );
      
      toast.success('分类删除成功');
      fetchCategories();
      return true;
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('删除失败');
      return false;
    }
  };

  const reorderCategories = async (newOrderedCategories: KnowledgeCategory[]) => {
    try {
      const beforeOrder = categories.map(c => c.name);
      
      for (let i = 0; i < newOrderedCategories.length; i++) {
        const { error } = await supabase
          .from('knowledge_categories')
          .update({ sort_order: i + 1 })
          .eq('id', newOrderedCategories[i].id);
        
        if (error) throw error;
      }
      
      await logOperationToDb(
        'knowledge_base',
        'update',
        null,
        { order: beforeOrder },
        { order: newOrderedCategories.map(c => c.name) },
        `调整分类顺序`
      );
      
      toast.success('分类顺序已更新');
      fetchCategories();
      return true;
    } catch (error) {
      console.error('Error reordering categories:', error);
      toast.error('排序更新失败');
      return false;
    }
  };

  return { categories, loading, fetchCategories, addCategory, updateCategory, deleteCategory, reorderCategories };
}

export function useKnowledgeArticles(categoryId?: string, currentEmployeeId?: string, isSuperAdmin?: boolean) {
  const queryClient = useQueryClient();
  const { viewingTenantId } = useTenantView() || {};

  const { data: articles = [], isLoading: loading } = useQuery({
    queryKey: ['knowledge-articles', categoryId, currentEmployeeId, isSuperAdmin, viewingTenantId ?? ''],
    queryFn: async () => {
      if (viewingTenantId && categoryId) {
        const { data, error } = await supabase.rpc('platform_get_tenant_knowledge_articles', {
          p_category_id: categoryId,
          p_tenant_id: viewingTenantId,
        });
        if (error) throw error;
        return (data || []) as KnowledgeArticle[];
      }
      let query = supabase
        .from('knowledge_articles')
        .select('*')
        .eq('is_published', true)
        .order('sort_order')
        .order('created_at', { ascending: false });

      if (categoryId) {
        query = query.eq('category_id', categoryId);
      }

      const { data, error } = await query;
      if (error) throw error;
      
      return (data || []).filter((article: any) => {
        if (isSuperAdmin) return true;
        if (article.created_by === currentEmployeeId) return true;
        if (article.visibility === 'public') return true;
        return false;
      }) as KnowledgeArticle[];
    },
  });

  const fetchArticles = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['knowledge-articles', categoryId, currentEmployeeId, isSuperAdmin, viewingTenantId ?? ''] });
  }, [queryClient, categoryId, currentEmployeeId, isSuperAdmin, viewingTenantId]);

  const addArticle = async (article: Omit<KnowledgeArticle, 'id' | 'created_at' | 'updated_at' | 'created_by'>) => {
    try {
      const { data, error } = await supabase
        .from('knowledge_articles')
        .insert(article)
        .select()
        .single();

      if (error) throw error;
      
      await logOperationToDb(
        'knowledge_base',
        'create',
        data?.id || null,
        null,
        { title_zh: article.title_zh, title_en: article.title_en, content: article.content?.substring(0, 100) },
        `新增文章: ${article.title_zh}`
      );
      
      // Auto-mark as read for the creator
      if (data?.id && currentEmployeeId) {
        try {
          await supabase
            .from('knowledge_read_status')
            .upsert({
              employee_id: currentEmployeeId,
              article_id: data.id,
            }, { onConflict: 'employee_id,article_id' });
        } catch (e) {
          console.warn('Auto-mark read failed:', e);
        }
      }
      
      toast.success('内容发布成功');
      fetchArticles();
      return true;
    } catch (error) {
      console.error('Error adding article:', error);
      toast.error('发布失败');
      return false;
    }
  };

  const updateArticle = async (id: string, updates: Partial<KnowledgeArticle>) => {
    try {
      const currentArticle = articles.find(a => a.id === id);
      
      const { error } = await supabase
        .from('knowledge_articles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
      
      await logOperationToDb(
        'knowledge_base',
        'update',
        id,
        currentArticle ? { title_zh: currentArticle.title_zh, title_en: currentArticle.title_en, content: currentArticle.content?.substring(0, 100) } : null,
        { title_zh: updates.title_zh, title_en: updates.title_en, content: updates.content?.substring(0, 100) },
        `编辑文章: ${currentArticle?.title_zh || updates.title_zh || id}`
      );
      
      toast.success('内容更新成功');
      fetchArticles();
      return true;
    } catch (error) {
      console.error('Error updating article:', error);
      toast.error('更新失败');
      return false;
    }
  };

  const deleteArticle = async (id: string) => {
    try {
      const currentArticle = articles.find(a => a.id === id);
      
      const { error } = await supabase
        .from('knowledge_articles')
        .delete()
        .eq('id', id);

      if (error) throw error;
      
      await logOperationToDb(
        'knowledge_base',
        'delete',
        id,
        currentArticle ? { title_zh: currentArticle.title_zh, title_en: currentArticle.title_en, content: currentArticle.content?.substring(0, 100) } : null,
        null,
        `删除文章: ${currentArticle?.title_zh || id}`
      );
      
      toast.success('内容删除成功');
      fetchArticles();
      return true;
    } catch (error) {
      console.error('Error deleting article:', error);
      toast.error('删除失败');
      return false;
    }
  };

  const updateArticleSortOrders = async (updates: { id: string; sort_order: number }[]) => {
    try {
      for (const update of updates) {
        const { error } = await supabase
          .from('knowledge_articles')
          .update({ sort_order: update.sort_order })
          .eq('id', update.id);
        
        if (error) throw error;
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
      console.error('Error updating sort orders:', error);
      toast.error('排序更新失败');
      return false;
    }
  };

  return { articles, loading, fetchArticles, addArticle, updateArticle, deleteArticle, updateArticleSortOrders };
}

export function useUnreadCount() {
  const { employee } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    if (!employee?.id) return;

    try {
      // 🔧 修复：只统计公开的已发布文章，且排除自己创建的文章
      const { data: articles, error: articlesError } = await supabase
        .from('knowledge_articles')
        .select('id')
        .eq('is_published', true)
        .eq('visibility', 'public')
        .neq('created_by', employee.id);

      if (articlesError) throw articlesError;

      // Get read articles for this employee
      const { data: readStatus, error: readError } = await supabase
        .from('knowledge_read_status')
        .select('article_id')
        .eq('employee_id', employee.id);

      if (readError) throw readError;

      const readArticleIds = new Set((readStatus || []).map(r => r.article_id));
      const unread = (articles || []).filter(a => !readArticleIds.has(a.id));
      
      setUnreadCount(unread.length);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  }, [employee?.id]);

  useEffect(() => {
    fetchUnreadCount();
    
    // Listen for local read-update events for instant cross-component sync
    const handleReadUpdate = () => {
      setUnreadCount(prev => Math.max(0, prev - 1));
    };
    window.addEventListener('knowledge-read-update', handleReadUpdate);
    
    // Subscribe to changes
    const channelId = `knowledge-unread-${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelId)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'knowledge_articles' }, (payload) => {
        const newArticle = payload.new as any;
        // Skip unread count refresh and notification for own articles
        if (newArticle.created_by === employee?.id) return;
        fetchUnreadCount();
        if (newArticle.visibility === 'public') {
          toast.info('有新的公司文档发布，请查看', { duration: 5000 });
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'knowledge_articles' }, () => {
        fetchUnreadCount();
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'knowledge_articles' }, () => {
        fetchUnreadCount();
      })
      .subscribe();

    return () => {
      window.removeEventListener('knowledge-read-update', handleReadUpdate);
      supabase.removeChannel(channel);
    };
  }, [fetchUnreadCount, employee?.id]);

  const markAsRead = async (articleId: string) => {
    if (!employee?.id) return;

    try {
      const { error } = await supabase
        .from('knowledge_read_status')
        .upsert({
          employee_id: employee.id,
          article_id: articleId,
        }, {
          onConflict: 'employee_id,article_id',
        });

      if (error) throw error;
      // Immediately decrement local count for instant UI feedback
      setUnreadCount(prev => Math.max(0, prev - 1));
      // Also broadcast to other hook instances via custom event
      window.dispatchEvent(new CustomEvent('knowledge-read-update'));
    } catch (error) {
      console.error('Error marking as read:', error);
    }
  };

  const markAllAsRead = async () => {
    if (!employee?.id) return;

    try {
      // 🔧 修复：只标记公开且非自己创建的文章为已读
      const { data: articles } = await supabase
        .from('knowledge_articles')
        .select('id')
        .eq('is_published', true)
        .eq('visibility', 'public')
        .neq('created_by', employee.id);

      if (!articles?.length) return;

      const inserts = articles.map(a => ({
        employee_id: employee.id,
        article_id: a.id,
      }));

      const { error } = await supabase
        .from('knowledge_read_status')
        .upsert(inserts, {
          onConflict: 'employee_id,article_id',
        });

      if (error) throw error;
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  return { unreadCount, fetchUnreadCount, markAsRead, markAllAsRead };
}

// 🔧 新增：文章已读状态 hook，用于在列表中标记未读文章
export function useArticleReadStatus() {
  const { employee } = useAuth();
  const [readArticleIds, setReadArticleIds] = useState<Set<string>>(new Set());

  const fetchReadStatus = useCallback(async () => {
    if (!employee?.id) return;
    const { data } = await supabase
      .from('knowledge_read_status')
      .select('article_id')
      .eq('employee_id', employee.id);
    setReadArticleIds(new Set((data || []).map(r => r.article_id)));
  }, [employee?.id]);

  useEffect(() => {
    fetchReadStatus();
    const channel = supabase
      .channel('article-read-status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'knowledge_read_status' }, fetchReadStatus)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchReadStatus]);

  return { readArticleIds, refetch: fetchReadStatus };
}

export async function uploadKnowledgeImage(file: File): Promise<string | null> {
  try {
    // Validate file size (max 10MB before compression)
    const MAX_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      toast.error('图片大小不能超过 10MB / Image must be under 10MB');
      return null;
    }

    // Convert to WebP format using canvas (compresses + converts)
    const webpBlob = await convertToWebP(file);
    
    // Log compression ratio
    const ratio = ((1 - webpBlob.size / file.size) * 100).toFixed(0);
    console.log(`[Image] Compressed ${(file.size / 1024).toFixed(0)}KB → ${(webpBlob.size / 1024).toFixed(0)}KB (${ratio}% smaller)`);
    
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.webp`;
    const { data, error } = await supabase.storage
      .from('knowledge-images')
      .upload(fileName, webpBlob, {
        contentType: 'image/webp',
      });

    if (error) throw error;

    const { data: urlData } = await supabase.storage
      .from('knowledge-images')
      .createSignedUrl(data.path, 60 * 60 * 24 * 365); // 1 year signed URL

    return urlData?.signedUrl || null;
  } catch (error) {
    console.error('Error uploading image:', error);
    toast.error('图片上传失败');
    return null;
  }
}

async function convertToWebP(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      // Max dimension 1920px
      const maxDim = 1920;
      let { width, height } = img;
      
      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width *= ratio;
        height *= ratio;
      }

      canvas.width = width;
      canvas.height = height;
      ctx?.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Failed to convert image'));
          }
        },
        'image/webp',
        0.85
      );
    };

    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
