// ============= 交班对账表单持久化 Hook =============
// 使用 user_data_store（按用户隔离）支持跨设备同步
// 每个账号有独立的草稿数据，不会相互覆盖
// 🔧 修复：从 shared_data_store 迁移到 user_data_store

import { useState, useEffect, useCallback, useRef } from 'react';
import { loadFromDatabase, saveToDatabase, SYNC_KEYS, SyncKey } from '@/services/userDataSyncService';

interface ShiftHandoverFormData {
  selectedReceiver: string;
  vendorInputs: Record<string, string>;  // vendorName -> inputValue
  providerInputs: Record<string, string>; // providerName -> inputValue
  remark: string;
}

const defaultFormData: ShiftHandoverFormData = {
  selectedReceiver: '',
  vendorInputs: {},
  providerInputs: {},
  remark: '',
};

// 防抖保存延迟（毫秒）
const SAVE_DEBOUNCE_MS = 500;

export function useShiftHandoverFormPersistence() {
  const [formData, setFormData] = useState<ShiftHandoverFormData>(defaultFormData);
  const [isLoading, setIsLoading] = useState(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  // 跟踪待保存的数据，用于组件卸载时强制保存
  const pendingDataRef = useRef<ShiftHandoverFormData | null>(null);
  // 跟踪是否已加载完成，防止初始化时覆盖
  const hasLoadedRef = useRef(false);
  
  // 初始化：从用户数据库加载
  useEffect(() => {
    isMountedRef.current = true;
    
    const loadFromDb = async () => {
      try {
        const saved = await loadFromDatabase(SYNC_KEYS.SHIFT_HANDOVER_FORM);
        if (isMountedRef.current && saved) {
          const mergedData = { ...defaultFormData, ...saved } as ShiftHandoverFormData;
          setFormData(mergedData);
        }
        hasLoadedRef.current = true;
      } catch (error) {
        console.error('[ShiftHandoverFormPersistence] Failed to load:', error);
        hasLoadedRef.current = true;
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
  
  // 防抖保存到用户数据库
  const saveToDb = useCallback((data: ShiftHandoverFormData) => {
    // 标记待保存数据
    pendingDataRef.current = data;
    
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      pendingDataRef.current = null; // 保存完成，清除待保存标记
      try {
        await saveToDatabase(SYNC_KEYS.SHIFT_HANDOVER_FORM, data);
      } catch (error) {
        console.error('[ShiftHandoverFormPersistence] Failed to save:', error);
      }
    }, SAVE_DEBOUNCE_MS);
  }, []);
  
  // 更新接班人选择
  const setSelectedReceiver = useCallback((value: string) => {
    if (!hasLoadedRef.current) return; // 未加载完成时忽略
    setFormData(prev => {
      const next = { ...prev, selectedReceiver: value };
      saveToDb(next);
      return next;
    });
  }, [saveToDb]);
  
  // 更新卡商输入值
  const setVendorInput = useCallback((vendorName: string, value: string) => {
    if (!hasLoadedRef.current) return; // 未加载完成时忽略
    setFormData(prev => {
      const next = {
        ...prev,
        vendorInputs: { ...prev.vendorInputs, [vendorName]: value },
      };
      saveToDb(next);
      return next;
    });
  }, [saveToDb]);
  
  // 更新代付商家输入值
  const setProviderInput = useCallback((providerName: string, value: string) => {
    if (!hasLoadedRef.current) return; // 未加载完成时忽略
    setFormData(prev => {
      const next = {
        ...prev,
        providerInputs: { ...prev.providerInputs, [providerName]: value },
      };
      saveToDb(next);
      return next;
    });
  }, [saveToDb]);
  
  // 更新备注
  const setRemark = useCallback((value: string) => {
    if (!hasLoadedRef.current) return; // 未加载完成时忽略
    setFormData(prev => {
      const next = { ...prev, remark: value };
      saveToDb(next);
      return next;
    });
  }, [saveToDb]);
  
  // 获取卡商输入值
  const getVendorInput = useCallback((vendorName: string): string => {
    return formData.vendorInputs[vendorName] || '';
  }, [formData.vendorInputs]);
  
  // 获取代付商家输入值
  const getProviderInput = useCallback((providerName: string): string => {
    return formData.providerInputs[providerName] || '';
  }, [formData.providerInputs]);
  
  // 清空表单
  const clearForm = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    pendingDataRef.current = null; // 清空待保存数据
    setFormData(defaultFormData);
    await saveToDatabase(SYNC_KEYS.SHIFT_HANDOVER_FORM, defaultFormData);
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
        saveToDatabase(SYNC_KEYS.SHIFT_HANDOVER_FORM, pendingDataRef.current).catch(console.error);
      }
    };
  }, []);
  
  return {
    selectedReceiver: formData.selectedReceiver,
    remark: formData.remark,
    setSelectedReceiver,
    setVendorInput,
    setProviderInput,
    setRemark,
    getVendorInput,
    getProviderInput,
    clearForm,
    isLoading,
  };
}
