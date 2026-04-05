// Exchange Rate Form Store - Persist form data using shared_data_store
// 表单数据使用 shared_data_store 存储以支持跨设备同步

import { loadSharedData, saveSharedData } from '@/services/finance/sharedDataService';

const DATA_KEY = 'exchangeRateFormData' as const;

export interface ExchangeRateFormData {
  cardType: string;
  cardMerchant: string;
  paymentAgent: string;
  phoneNumber: string;
  memberCode: string;
  memberLevel: string;
  selectedCommonCards: string[];
  customerFeature: string;
  remarkOrder: string;
  remarkMember: string;
  bankCard: string;
  cardValue: string;
  cardRate: string;
  payNaira: string;
  payCedi: string;
  payUsdt: string;
  nairaRate: number;
  cediRate: number;
  currencyPreferenceList: string[];
  customerSource: string; // 客户来源ID
}

// 内存缓存
let formDataCache: ExchangeRateFormData | null = null;

export async function getExchangeRateFormDataAsync(): Promise<ExchangeRateFormData | null> {
  try {
    // 使用独立的键，避免与 rateSettingEntries（汇率条目列表）冲突
    const data = await loadSharedData<ExchangeRateFormData>('exchangeRateFormData' as any);
    formDataCache = data;
    return data;
  } catch (error) {
    console.error('[ExchangeRateForm] Failed to load form data:', error);
    return null;
  }
}

export function getExchangeRateFormData(): ExchangeRateFormData | null {
  // 返回缓存数据，异步刷新
  getExchangeRateFormDataAsync().catch(console.error);
  return formDataCache;
}

export async function saveExchangeRateFormData(data: ExchangeRateFormData): Promise<void> {
  formDataCache = data;
  // 使用独立的键，避免与 rateSettingEntries（汇率条目列表）冲突
  await saveSharedData('exchangeRateFormData' as any, data);
}

export async function clearExchangeRateFormData(): Promise<void> {
  formDataCache = null;
  // 使用独立的键，避免与 rateSettingEntries（汇率条目列表）冲突
  await saveSharedData('exchangeRateFormData' as any, null);
}
