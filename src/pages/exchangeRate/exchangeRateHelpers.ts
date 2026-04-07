import {
  fetchMerchantCards,
  fetchMerchantPaymentProviders,
  fetchMerchantVendors,
} from "@/services/finance/merchantConfigReadService";
import { getSharedDataTenantId } from "@/services/finance/sharedDataService";

/** 与 loadQuickSettings / DB 迁移默认一致：首屏即渲染 8 个快捷钮，避免空数组等 API */
export const DEFAULT_QUICK_AMOUNTS: string[] = ['50', '100', '200', '300', '500', '1000', '1500', '2000'];
export const DEFAULT_QUICK_RATES: string[] = ['5.7', '5.8', '5.95', '6.22', '6.57', '6.8', '7.0', '7.26'];

// 从数据库获取卡片列表（异步）- 按 sort_order 升序排列
export const fetchCardsFromDatabase = async (): Promise<{ id: string; name: string; cardVendors?: string[] }[]> => {
  try {
    const tid = getSharedDataTenantId();
    if (!tid) return [];
    const rows = await fetchMerchantCards(tid);
    return rows
      .filter((row) => row.status === "active")
      .map((row) => ({ id: row.id, name: row.name, cardVendors: row.cardVendors || [] }));
  } catch (error) {
    console.error('Failed to fetch cards from database:', error);
    return [];
  }
};

export const fetchVendorsFromDatabase = async (): Promise<{ id: string; name: string; paymentProviders?: string[] }[]> => {
  try {
    const tid = getSharedDataTenantId();
    if (!tid) return [];
    const rows = await fetchMerchantVendors(tid);
    return rows
      .filter((row) => row.status === "active")
      .map((row) => ({ id: row.id, name: row.name, paymentProviders: row.paymentProviders || [] }));
  } catch (error) {
    console.error('Failed to fetch vendors from database:', error);
    return [];
  }
};

export const fetchPaymentProvidersFromDatabase = async (): Promise<{ id: string; name: string }[]> => {
  try {
    const tid = getSharedDataTenantId();
    if (!tid) return [];
    const rows = await fetchMerchantPaymentProviders(tid);
    return rows
      .filter((row) => row.status === "active")
      .map((row) => ({ id: row.id, name: row.name }));
  } catch (error) {
    console.error('Failed to fetch payment providers from database:', error);
    return [];
  }
};
