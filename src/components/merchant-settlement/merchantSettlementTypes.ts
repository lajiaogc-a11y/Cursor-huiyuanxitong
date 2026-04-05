import type {
  CardMerchantSettlement,
  PaymentProviderSettlement,
} from "@/services/finance/merchantSettlementService";
import type { ProviderSettlementRow, VendorSettlementRow } from "./types";

/** Page-level settlement row shape (alias of VendorSettlementRow). */
export type VendorSettlementData = VendorSettlementRow;
/** Page-level settlement row shape (alias of ProviderSettlementRow). */
export type ProviderSettlementData = ProviderSettlementRow;

export interface MSCacheData {
  cards: any[];
  vendors: any[];
  providers: any[];
  dbOrders: any[];
  activityGifts: any[];
  cardSettlements: CardMerchantSettlement[];
  providerSettlements: PaymentProviderSettlement[];
  employees: { id: string; real_name: string }[];
  loadedAt: number;
}

export let _msCache: MSCacheData | null = null;

const _MS_CACHE_TTL = 60 * 1000; // 1 minute – keep data fresh on page revisit

export const _msCacheValid = () =>
  _msCache != null && Date.now() - _msCache.loadedAt < _MS_CACHE_TTL;

if (typeof window !== "undefined") {
  window.addEventListener("userDataSynced", () => {
    _msCache = null;
  });
}
