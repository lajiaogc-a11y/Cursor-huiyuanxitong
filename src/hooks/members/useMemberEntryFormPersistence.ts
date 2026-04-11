// ============= 新增会员表单持久化 Hook =============
// 使用数据库存储（user_data_store）实现用户级持久化
// 切换导航时数据不丢失

import { useState, useEffect, useCallback, useRef } from 'react';
import { SYNC_KEYS, loadFromDatabase, saveToDatabase } from '@/services/userDataSyncService';
import { generateMemberCode } from '@/lib/memberCode';

export { generateMemberCode };

const DATA_KEY = SYNC_KEYS.MEMBER_ENTRY_FORM;

export interface MemberEntryFormData {
  phoneNumber: string;
  memberCode: string;
  bankCard: string;
  preferredCurrency: string[];
  selectedCommonCards: string[];
  memberLevel: string;
  customerSource: string;
  customerFeature: string;
  remark: string;
}

const defaultFormData: MemberEntryFormData = {
  phoneNumber: '',
  memberCode: '',
  bankCard: '',
  preferredCurrency: [],
  selectedCommonCards: [],
  memberLevel: 'D',
  customerSource: '',
  customerFeature: '',
  remark: '',
};

// 防抖保存延迟（毫秒）
const SAVE_DEBOUNCE_MS = 1500;

// 内存缓存，用于快速恢复
let memoryCache: MemberEntryFormData | null = null;

export function useMemberEntryFormPersistence() {
  const [formData, setFormDataState] = useState<MemberEntryFormData>(() => {
    // 优先使用内存缓存
    if (memoryCache) {
      return memoryCache;
    }
    // 初始化时不生成会员编号，等待电话号码输入后再决定
    return { ...defaultFormData };
  });
  const [isLoading, setIsLoading] = useState(!memoryCache);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const pendingDataRef = useRef<MemberEntryFormData | null>(null);
  
  // 初始化：从数据库加载
  useEffect(() => {
    isMountedRef.current = true;
    
    // 如果有缓存，跳过加载
    if (memoryCache) {
      setIsLoading(false);
      return;
    }
    
    const loadFromDb = async () => {
      try {
        const saved = await loadFromDatabase(DATA_KEY);
        if (isMountedRef.current && saved) {
          const merged = { ...defaultFormData, ...saved };
          setFormDataState(merged);
          memoryCache = merged;
        }
      } catch (error) {
        console.error('[MemberEntryFormPersistence] Failed to load:', error);
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };
    
    loadFromDb();
    
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  
  // 防抖保存到数据库
  const saveToDb = useCallback((data: MemberEntryFormData) => {
    // 同步更新内存缓存
    memoryCache = data;
    pendingDataRef.current = data;
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      pendingDataRef.current = null;
      saveToDatabase(DATA_KEY, data).catch(error => {
        console.error('[MemberEntryFormPersistence] Failed to save:', error);
      });
    }, SAVE_DEBOUNCE_MS);
  }, []);
  
  // 更新单个字段
  const updateField = useCallback(<K extends keyof MemberEntryFormData>(
    field: K, 
    value: MemberEntryFormData[K]
  ) => {
    setFormDataState(prev => {
      const next = { ...prev, [field]: value };
      saveToDb(next);
      return next;
    });
  }, [saveToDb]);
  
  // 批量更新表单数据（用于自动填充会员信息）
  const setFormData = useCallback((data: Partial<MemberEntryFormData>) => {
    setFormDataState(prev => {
      const next = { ...prev, ...data };
      saveToDb(next);
      return next;
    });
  }, [saveToDb]);
  
  // 刷新会员编号
  const refreshMemberCode = useCallback(() => {
    const newCode = generateMemberCode();
    updateField('memberCode', newCode);
    return newCode;
  }, [updateField]);
  
  // 清空表单（提交成功后调用）
  const clearForm = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    pendingDataRef.current = null;
    const newFormData = { ...defaultFormData };
    setFormDataState(newFormData);
    memoryCache = newFormData;
    await saveToDatabase(DATA_KEY, newFormData);
  }, []);
  
  // 清空除电话号码外的字段
  const clearFieldsExceptPhone = useCallback(() => {
    setFormDataState(prev => {
      const next = {
        ...defaultFormData,
        phoneNumber: prev.phoneNumber,
        memberCode: '',
      };
      saveToDb(next);
      return next;
    });
  }, [saveToDb]);
  
  // 组件卸载时清理 - 强制保存待处理数据
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      if (pendingDataRef.current) {
        saveToDatabase(DATA_KEY, pendingDataRef.current).catch(console.error);
      }
    };
  }, []);
  
  return {
    formData,
    updateField,
    setFormData,
    refreshMemberCode,
    clearForm,
    clearFieldsExceptPhone,
    isLoading,
  };
}
