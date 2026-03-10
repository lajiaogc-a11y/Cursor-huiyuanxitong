// 汇率计算器状态管理 Hook
// 全局共享状态：USDT汇率、奈拉汇率、赛地汇率、BTC价格、USDT手续费、现金专属
// 独立状态：每个计算器有自己的表单数据
// 性能优化：增加防抖间隔至1500ms，减少数据库写入频率

import { useState, useCallback, useEffect, useRef } from 'react';
import { loadSharedData, saveSharedData } from '@/services/sharedDataService';
import { markInputActive } from '@/lib/performanceUtils';

// 自动保存防抖时间（毫秒）- 增加以减少写入频率
const AUTO_SAVE_DEBOUNCE_MS = 1500;

// 单个计算器的表单数据类型
export interface CalculatorFormData {
  // 卡片面值模块
  cardValue: string;
  cardRate: string;
  
  // 必填信息模块
  cardType: string;
  cardMerchant: string;
  paymentAgent: string;
  phoneNumber: string;
  
  // 会员编号模块
  memberCode: string;
  memberLevel: string;
  selectedCommonCards: string[];
  customerFeature: string;
  bankCard: string;
  remarkMember: string;
  remarkOrder: string;
  currencyPreferenceList: string[];
  customerSource: string;
  
  // 支付模块
  payNaira: string;
  payCedi: string;
  payUsdt: string;
}

// 默认空表单
const createEmptyForm = (): CalculatorFormData => ({
  cardValue: '',
  cardRate: '',
  cardType: '',
  cardMerchant: '',
  paymentAgent: '',
  phoneNumber: '',
  memberCode: '',
  memberLevel: '',
  selectedCommonCards: [],
  customerFeature: '',
  bankCard: '',
  remarkMember: '',
  remarkOrder: '',
  currencyPreferenceList: [],
  customerSource: '',
  payNaira: '',
  payCedi: '',
  payUsdt: '',
});

// 三个计算器的数据存储键
const CALC_STORAGE_KEYS = {
  calc1: 'calculatorFormData_1',
  calc2: 'calculatorFormData_2',
  calc3: 'calculatorFormData_3',
} as const;

export type CalculatorId = keyof typeof CALC_STORAGE_KEYS;

// 内存缓存
const formDataCache: Record<CalculatorId, CalculatorFormData> = {
  calc1: createEmptyForm(),
  calc2: createEmptyForm(),
  calc3: createEmptyForm(),
};

let cacheInitialized = false;

// 异步初始化缓存
export async function initCalculatorCache(): Promise<void> {
  if (cacheInitialized) return;
  
  const promises = Object.entries(CALC_STORAGE_KEYS).map(async ([calcId, key]) => {
    const data = await loadSharedData<CalculatorFormData>(key as any);
    if (data) {
      formDataCache[calcId as CalculatorId] = { ...createEmptyForm(), ...data };
    }
  });
  
  await Promise.all(promises);
  cacheInitialized = true;
}

// 获取指定计算器的表单数据
export function getCalculatorFormData(calcId: CalculatorId): CalculatorFormData {
  return formDataCache[calcId] || createEmptyForm();
}

// 保存指定计算器的表单数据
export async function saveCalculatorFormData(calcId: CalculatorId, data: CalculatorFormData): Promise<void> {
  formDataCache[calcId] = data;
  await saveSharedData(CALC_STORAGE_KEYS[calcId] as any, data);
}

// 清空指定计算器的表单数据
export async function clearCalculatorFormData(calcId: CalculatorId): Promise<void> {
  const emptyForm = createEmptyForm();
  formDataCache[calcId] = emptyForm;
  await saveSharedData(CALC_STORAGE_KEYS[calcId] as any, emptyForm);
}

// Hook: 使用计算器表单数据
export function useCalculatorForm(calcId: CalculatorId) {
  const [formData, setFormData] = useState<CalculatorFormData>(() => getCalculatorFormData(calcId));
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // 新增：跟踪待保存的数据，用于组件卸载时强制保存
  const pendingDataRef = useRef<CalculatorFormData | null>(null);
  // 保存 calcId 的引用，确保清理函数中使用最新值
  const calcIdRef = useRef(calcId);
  calcIdRef.current = calcId;
  
  // 初始化时从数据库加载
  useEffect(() => {
    initCalculatorCache().then(() => {
      setFormData(getCalculatorFormData(calcId));
    });
  }, [calcId]);
  
  // 更新单个字段 - 优化：标记输入活动状态
  const updateField = useCallback(<K extends keyof CalculatorFormData>(
    field: K, 
    value: CalculatorFormData[K]
  ) => {
    // 标记用户正在输入
    markInputActive();
    
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      
      // 同步更新内存缓存（立即生效，避免跨组件读取时获取旧值）
      formDataCache[calcId] = newData;
      
      // 标记待保存数据
      pendingDataRef.current = newData;
      
      // 防抖保存 - 使用增加的延迟
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        pendingDataRef.current = null; // 保存完成，清除待保存标记
        saveCalculatorFormData(calcId, newData).catch(console.error);
      }, AUTO_SAVE_DEBOUNCE_MS);
      
      return newData;
    });
  }, [calcId]);
  
  // 批量更新字段 - 优化：标记输入活动状态
  const updateFields = useCallback((updates: Partial<CalculatorFormData>) => {
    // 标记用户正在输入
    markInputActive();
    
    setFormData(prev => {
      const newData = { ...prev, ...updates };
      
      // 同步更新内存缓存（立即生效）
      formDataCache[calcId] = newData;
      
      // 标记待保存数据
      pendingDataRef.current = newData;
      
      // 防抖保存 - 使用增加的延迟
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        pendingDataRef.current = null; // 保存完成，清除待保存标记
        saveCalculatorFormData(calcId, newData).catch(console.error);
      }, AUTO_SAVE_DEBOUNCE_MS);
      
      return newData;
    });
  }, [calcId]);
  
  // 清空表单
  const clearForm = useCallback(async () => {
    const emptyForm = createEmptyForm();
    setFormData(emptyForm);
    pendingDataRef.current = null; // 清空待保存数据
    await clearCalculatorFormData(calcId);
  }, [calcId]);
  
  // 组件卸载时清理 - 关键修复：强制保存待处理数据
  useEffect(() => {
    return () => {
      // 清除定时器
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      // 关键修复：如果有待保存的数据，立即保存
      if (pendingDataRef.current) {
        saveCalculatorFormData(calcIdRef.current, pendingDataRef.current).catch(console.error);
      }
    };
  }, []);
  
  return {
    formData,
    updateField,
    updateFields,
    clearForm,
    setFormData,
  };
}
