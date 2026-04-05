/**
 * 手续费计算 — 与系统设置中的奈拉/赛地阈值、USDT 固定费一致
 */
import { getFeeSettings, getUsdtFee } from '@/services/system/systemSettingsService';

export function calculateTransactionFee(currency: string, amount: string | number): number {
  const amountNum = typeof amount === 'number' ? amount : parseFloat(String(amount)) || 0;
  const absAmount = Math.abs(amountNum);
  const feeSettings = getFeeSettings();

  if (currency === 'NGN' || currency === '奈拉') {
    return absAmount >= feeSettings.nairaThreshold ? feeSettings.nairaFeeAbove : feeSettings.nairaFeeBelow;
  }
  if (currency === 'GHS' || currency === '赛地') {
    return absAmount >= feeSettings.cediThreshold ? feeSettings.cediFeeAbove : feeSettings.cediFeeBelow;
  }
  if (currency === 'USDT') {
    return getUsdtFee() || 0;
  }
  return 0;
}
