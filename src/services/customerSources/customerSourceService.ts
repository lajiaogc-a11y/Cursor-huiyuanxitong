// Customer Source Store - 客户来源管理
// 使用数据库作为唯一数据源

import { createCustomerSourceData, patchCustomerSourceData, deleteCustomerSourceData } from '@/api/customerSourceData';
import { getCustomerSourcesApi } from '@/api/staffData';
import { logOperation } from '@/services/audit/auditLogService';
import { emitDataRefresh } from '@/services/system/dataConsistencyHub';

type CustomerSourceRow = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

/** MySQL/JSON 常见 0|1、字符串；缺省视为启用，避免「活跃」筛选把列表误滤空 */
function parseIsActive(raw: unknown): boolean {
  if (raw === true || raw === 1) return true;
  if (raw === false || raw === 0) return false;
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (s === '1' || s === 'true' || s === 'yes' || s === 'active') return true;
    if (s === '0' || s === 'false' || s === 'no' || s === 'inactive') return false;
  }
  return true;
}

function mapApiRowToCustomerSource(row: Record<string, unknown>): CustomerSource {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    sortOrder: Number(row.sort_order ?? row.sortOrder ?? 0),
    isActive: parseIsActive(row.is_active ?? row.isActive),
    createdAt: String(row.created_at ?? row.createdAt ?? ''),
    updatedAt: String(row.updated_at ?? row.updatedAt ?? ''),
  };
}

function unwrapInsertedRow(data: unknown): CustomerSourceRow | null {
  if (data == null) return null;
  if (Array.isArray(data)) return (data[0] as CustomerSourceRow) ?? null;
  return data as CustomerSourceRow;
}

export interface CustomerSource {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

function mapRowToSource(s: CustomerSourceRow): CustomerSource {
  return mapApiRowToCustomerSource(s as unknown as Record<string, unknown>);
}

export const CUSTOMER_SOURCES_QUERY_KEY = ['customer-sources'] as const;

export async function fetchCustomerSources(): Promise<CustomerSource[]> {
  const data = await getCustomerSourcesApi();
  return (data || []).map(mapRowToSource);
}

// ============= 内存缓存 (兼容旧代码) =============
let sourcesCache: CustomerSource[] = [];
let cacheInitialized = false;
/** 合并并发 initialize 请求，避免多处同时拉取 */
let cacheInitPromise: Promise<void> | null = null;

// ============= 缓存初始化 =============
export async function initializeCustomerSourceCache(): Promise<void> {
  if (cacheInitialized) return;
  if (!cacheInitPromise) {
    cacheInitPromise = (async () => {
      try {
        const data = await getCustomerSourcesApi();

        sourcesCache = (data || []).map((s) => ({
          id: s.id,
          name: s.name,
          sortOrder: s.sort_order,
          isActive: s.is_active,
          createdAt: s.created_at,
          updatedAt: s.updated_at,
        }));

        cacheInitialized = true;
        if (import.meta.env.DEV) {
          console.log('[CustomerSource] Cache initialized from database');
        }
      } catch (error) {
        console.error('[CustomerSource] Failed to initialize cache:', error);
      }
    })().finally(() => {
      cacheInitPromise = null;
    });
  }
  await cacheInitPromise;
}

// ============= 刷新缓存 =============
async function refreshCache(): Promise<void> {
  try {
    const data = await getCustomerSourcesApi();
    
    sourcesCache = (data || []).map((s) =>
      mapApiRowToCustomerSource(s as unknown as Record<string, unknown>),
    );
    try {
      emitDataRefresh({ table: 'customer_sources', operation: '*', source: 'manual' });
    } catch {
      /* ignore */
    }
  } catch (error) {
    console.error('[CustomerSource] Failed to refresh cache:', error);
  }
}

// ============= 读取函数 =============

/**
 * 同步读取缓存。若尚未 await `initializeCustomerSourceCache()`，可能仍为空数组。
 * 汇率页等须在展示前 await 初始化完成。
 */
export function getCustomerSources(): CustomerSource[] {
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
    
    const inserted = await createCustomerSourceData({
      name,
      sort_order: maxOrder + 1,
      is_active: true,
    });
    const data = unwrapInsertedRow(inserted);
    if (!data) throw new Error('Insert returned no row');

    const newSource: CustomerSource = {
      id: data.id,
      name: data.name,
      sortOrder: data.sort_order,
      isActive: parseIsActive(data.is_active),
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
    
    // 记录操作日志
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
    
    const patched = await patchCustomerSourceData(id, updateData);
    const data = unwrapInsertedRow(patched);
    if (!data) throw new Error('Update returned no row');

    const updatedSource: CustomerSource = {
      id: data.id,
      name: data.name,
      sortOrder: data.sort_order,
      isActive: parseIsActive(data.is_active),
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    };
    
    // 记录操作日志
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
    
    await deleteCustomerSourceData(id);
    
    // 记录操作日志
    if (sourceToDelete) {
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
    await Promise.all(
      sourceIds.map((id, index) =>
        patchCustomerSourceData(id, { sort_order: index + 1 })
      )
    );
    await refreshCache();
  } catch (error) {
    console.error('[CustomerSource] Failed to reorder sources:', error);
  }
}
