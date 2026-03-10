import type { CardMerchantSettlement, PaymentProviderSettlement } from "@/stores/merchantSettlementStore";

export interface VendorSettlementRow {
  vendorName: string;
  initialBalance: number;
  orderTotal: number;
  withdrawalTotal: number;
  postResetAdjustment: number;
  realTimeBalance: number;
  lastResetTime: string | null;
  settlement: CardMerchantSettlement | null;
}

export interface ProviderSettlementRow {
  providerName: string;
  initialBalance: number;
  orderTotal: number;
  giftTotal: number;
  rechargeTotal: number;
  postResetAdjustment: number;
  realTimeBalance: number;
  lastResetTime: string | null;
  settlement: PaymentProviderSettlement | null;
}
