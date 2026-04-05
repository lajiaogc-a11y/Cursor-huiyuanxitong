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

let _msCache: MSCacheData | null = null;

const _MS_CACHE_TTL = 60 * 1000;

export function getMsCache(): MSCacheData | null { return _msCache; }
export function setMsCache(v: MSCacheData | null) { _msCache = v; }
export function msCacheValid(): boolean {
  return _msCache != null && Date.now() - _msCache.loadedAt < _MS_CACHE_TTL;
}

function _clearMsCacheOnSync() { _msCache = null; }
if (typeof window !== "undefined") {
  window.addEventListener("userDataSynced", _clearMsCacheOnSync);
  if (import.meta.hot) {
    import.meta.hot.dispose(() => window.removeEventListener("userDataSynced", _clearMsCacheOnSync));
  }
}
