// Customer Source Store - 客户来源管理
// 使用数据库作为唯一数据源

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CustomerSource {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============= React Hook =============
export function useCustomerSources() {
  const [sources, setSources] = useState<CustomerSource[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSources = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('customer_sources')
        .select('*')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      
      setSources((data || []).map(s => ({
        id: s.id,
        name: s.name,
        sortOrder: s.sort_order,
        isActive: s.is_active,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      })));
    } catch (error) {
      console.error('[CustomerSource] Failed to fetch sources:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSources();

    const channel = supabase
      .channel('customer-sources-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_sources' }, () => {
        fetchSources();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchSources]);

  const activeSources = sources.filter(s => s.isActive).sort((a, b) => a.sortOrder - b.sortOrder);

  return {
    sources,
    activeSources,
    loading,
    refetch: fetchSources,
  };
}

// ============= 内存缓存 (兼容旧代码) =============
let sourcesCache: CustomerSource[] = [];
let cacheInitialized = false;

// ============= 缓存初始化 =============
export async function initializeCustomerSourceCache(): Promise<void> {
  if (cacheInitialized) return;
  
  try {
    const { data, error } = await supabase
      .from('customer_sources')
      .select('*')
      .order('sort_order', { ascending: true });
    
    if (error) throw error;
    
    sourcesCache = (data || []).map(s => ({
      id: s.id,
      name: s.name,
      sortOrder: s.sort_order,
      isActive: s.is_active,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    }));
    
    cacheInitialized = true;
    console.log('[CustomerSource] Cache initialized from database');
  } catch (error) {
    console.error('[CustomerSource] Failed to initialize cache:', error);
  }
}

// ============= 刷新缓存 =============
async function refreshCache(): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('customer_sources')
      .select('*')
      .order('sort_order', { ascending: true });
    
    if (error) throw error;
    
    sourcesCache = (data || []).map(s => ({
      id: s.id,
      name: s.name,
      sortOrder: s.sort_order,
      isActive: s.is_active,
      createdAt: s.created_at,
      updatedAt: s.updated_at,
    }));
  } catch (error) {
    console.error('[CustomerSource] Failed to refresh cache:', error);
  }
}

// ============= 读取函数 =============

export function getCustomerSources(): CustomerSource[] {
  if (!cacheInitialized) {
    initializeCustomerSourceCache();
  }
  return sourcesCache;
}

export function getActiveCustomerSources(): CustomerSource[] {
  return getCustomerSources()
    .filter(s => s.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// ============= 保存函数 (兼容性) =============

export async function saveCustomerSources(sources: CustomerSource[]): Promise<void> {
  console.warn('[CustomerSource] saveCustomerSources called - use individual CRUD functions instead');
  sourcesCache = sources;
}

// ============= CRUD 操作 =============

export async function addCustomerSource(name: string): Promise<CustomerSource | null> {
  try {
    const sources = getCustomerSources();
    const maxOrder = sources.length > 0 ? Math.max(...sources.map(s => s.sortOrder)) : 0;
    
    const { data, error } = await supabase
      .from('customer_sources')
      .insert({
        name,
        sort_order: maxOrder + 1,
        is_active: true,
      })
      .select()
      .single();
    
    if (error) throw error;
    
    const newSource: CustomerSource = {
      id: data.id,
      name: data.name,
      sortOrder: data.sort_order,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
    
    // 记录操作日志
    const { logOperation } = await import('@/stores/auditLogStore');
    logOperation('customer_source', 'create', newSource.id, null, newSource, `新增客户来源: ${newSource.name}`);
    
    await refreshCache();
    return newSource;
  } catch (error) {
    console.error('[CustomerSource] Failed to add source:', error);
    return null;
  }
}

export async function updateCustomerSource(id: string, updates: Partial<CustomerSource>): Promise<CustomerSource | null> {
  try {
    // 获取更新前的数据
    const beforeSource = sourcesCache.find(s => s.id === id);
    
    const updateData: Record<string, any> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.sortOrder !== undefined) updateData.sort_order = updates.sortOrder;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;
    
    const { data, error } = await supabase
      .from('customer_sources')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    
    const updatedSource: CustomerSource = {
      id: data.id,
      name: data.name,
      sortOrder: data.sort_order,
      isActive: data.is_active,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
    
    // 记录操作日志
    const { logOperation } = await import('@/stores/auditLogStore');
    logOperation('customer_source', 'update', id, beforeSource, updatedSource, `修改客户来源: ${updatedSource.name}`);
    
    await refreshCache();
    return updatedSource;
  } catch (error) {
    console.error('[CustomerSource] Failed to update source:', error);
    return null;
  }
}

export async function deleteCustomerSource(id: string): Promise<boolean> {
  try {
    // 获取删除前的数据
    const sourceToDelete = sourcesCache.find(s => s.id === id);
    
    const { error } = await supabase
      .from('customer_sources')
      .delete()
      .eq('id', id);
    
    if (error) throw error;
    
    // 记录操作日志
    if (sourceToDelete) {
      const { logOperation } = await import('@/stores/auditLogStore');
      logOperation('customer_source', 'delete', id, sourceToDelete, null, `删除客户来源: ${sourceToDelete.name}`);
    }
    
    await refreshCache();
    return true;
  } catch (error) {
    console.error('[CustomerSource] Failed to delete source:', error);
    return false;
  }
}

export async function reorderCustomerSources(sourceIds: string[]): Promise<void> {
  try {
    // 批量更新排序
    const updates = sourceIds.map((id, index) => 
      supabase
        .from('customer_sources')
        .update({ sort_order: index + 1 })
        .eq('id', id)
    );
    
    await Promise.all(updates);
    await refreshCache();
  } catch (error) {
    console.error('[CustomerSource] Failed to reorder sources:', error);
  }
}
