// ============= 推荐录入表单持久化 Hook =============
// 使用数据库存储（shared_data_store）支持跨设备同步
// 替代原来的 localStorage 实现

import { useState, useEffect, useCallback, useRef } from 'react';
import { loadSharedData, saveSharedData, type SharedDataKey } from '@/services/finance/sharedDataService';

const DATA_KEY: SharedDataKey = 'referralEntryForm';

interface ReferralFormData {
  referrerInput: string;
  refereePhone: string;
}

const defaultFormData: ReferralFormData = {
  referrerInput: '',
  refereePhone: '',
};

// 防抖保存延迟（毫秒）
const SAVE_DEBOUNCE_MS = 1000;

export function useReferralFormPersistence() {
  const [formData, setFormData] = useState<ReferralFormData>(defaultFormData);
  const [isLoading, setIsLoading] = useState(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  // 新增：跟踪待保存的数据，用于组件卸载时强制保存
  const pendingDataRef = useRef<ReferralFormData | null>(null);
  
  // 初始化：从数据库加载
  useEffect(() => {
    isMountedRef.current = true;
    
    const loadFromDb = async () => {
      try {
        const saved = await loadSharedData<ReferralFormData>(DATA_KEY);
        if (isMountedRef.current && saved) {
          setFormData({ ...defaultFormData, ...saved });
        }
      } catch (error) {
        console.error('[ReferralFormPersistence] Failed to load:', error);
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
  const saveToDb = useCallback((data: ReferralFormData) => {
    // 标记待保存数据
    pendingDataRef.current = data;
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      pendingDataRef.current = null; // 保存完成，清除待保存标记
      saveSharedData(DATA_KEY, data).catch(error => {
        console.error('[ReferralFormPersistence] Failed to save:', error);
      });
    }, SAVE_DEBOUNCE_MS);
  }, []);
  
  // 更新介绍人输入
  const setReferrerInput = useCallback((value: string) => {
    setFormData(prev => {
      const next = { ...prev, referrerInput: value };
      saveToDb(next);
      return next;
    });
  }, [saveToDb]);
  
  // 更新被推荐人电话
  const setRefereePhone = useCallback((value: string) => {
    setFormData(prev => {
      const next = { ...prev, refereePhone: value };
      saveToDb(next);
      return next;
    });
  }, [saveToDb]);
  
  // 清空表单
  const clearForm = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    pendingDataRef.current = null; // 清空待保存数据
    setFormData(defaultFormData);
    await saveSharedData(DATA_KEY, defaultFormData);
  }, []);
  
  // 组件卸载时清理 - 关键修复：强制保存待处理数据
  useEffect(() => {
    return () => {
      // 清除定时器
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      // 关键修复：如果有待保存的数据，立即保存
      if (pendingDataRef.current) {
        saveSharedData(DATA_KEY, pendingDataRef.current).catch(console.error);
      }
    };
  }, []);
  
  return {
    referrerInput: formData.referrerInput,
    refereePhone: formData.refereePhone,
    setReferrerInput,
    setRefereePhone,
    clearForm,
    isLoading,
  };
}
