/**
 * Copy Settings Service — 复制设置业务逻辑（从 CopySettingsTab.tsx 迁出）
 *
 * 职责：缓存管理、初始化、生成复制文本
 * 层级：Service（不含 UI 逻辑）
 */
import { loadSharedData, saveSharedData } from '@/services/finance/sharedDataService';
import {
  type CopySettings,
  DEFAULT_COPY_SETTINGS,
  normalizeCopySettingsFromStorage,
} from '@/lib/copySettingsDefaults';

export type { CopySettings };

let settingsCache: CopySettings | null = null;

export async function initializeCopySettings(): Promise<void> {
  try {
    const savedSettings = await loadSharedData<CopySettings>('copySettings');
    settingsCache = normalizeCopySettingsFromStorage(savedSettings);
  } catch (error) {
    console.error('[CopySettings] Failed to initialize:', error);
    settingsCache = DEFAULT_COPY_SETTINGS;
  }
}

export async function refreshCopySettings(): Promise<CopySettings> {
  try {
    const savedSettings = await loadSharedData<CopySettings>('copySettings');
    settingsCache = normalizeCopySettingsFromStorage(savedSettings);
    return settingsCache;
  } catch (error) {
    console.error('[CopySettings] Failed to refresh:', error);
    return settingsCache || DEFAULT_COPY_SETTINGS;
  }
}

export function getCopySettings(): CopySettings {
  if (settingsCache) return settingsCache;
  initializeCopySettings().catch(console.error);
  return DEFAULT_COPY_SETTINGS;
}

export function updateCopySettingsCache(settings: CopySettings): void {
  settingsCache = settings;
}

export function persistCopySettings(settings: CopySettings): void {
  settingsCache = settings;
  saveSharedData('copySettings', settings);
}

export function generateEnglishCopyText(data: {
  phoneNumber: string;
  memberCode?: string;
  earnedPoints: number;
  totalPoints: number;
  referralPoints: number;
  consumptionPoints: number;
  redeemableAmount: string;
  currency: string;
  rewardTiers: Array<{ range: string; ngn: number; ghs: number; usdt: number }>;
  activityType?: 'activity1' | 'activity2' | 'none';
  activity2Rates?: { pointsToNGN: number; pointsToGHS: number; pointsToUSDT: number };
}): string {
  const settings = getCopySettings();
  const tiers = data.rewardTiers ?? [];

  if (data.activityType === 'none') {
    return `Your Member ID: ${data.memberCode || data.phoneNumber}
Points Earned This Order: ${data.earnedPoints}
Your Total Points: ${data.totalPoints}
Your Referral Points: ${data.referralPoints}
Your Spending Points: ${data.consumptionPoints}
Estimated Redeemable Amount: ${data.redeemableAmount}

${settings.customNoteEnglish}`;
  }

  let text = `Your Member ID: ${data.memberCode || data.phoneNumber}
Points Earned This Order: ${data.earnedPoints}
Your Total Points: ${data.totalPoints}
Your Referral Points: ${data.referralPoints}
Your Spending Points: ${data.consumptionPoints}
Estimated Redeemable Amount: ${data.redeemableAmount}

FastGC Latest Promotions:
`;

  if (data.activityType === 'activity2' && data.activity2Rates) {
    if (data.currency === 'NGN') {
      text += `1 Point = ${data.activity2Rates.pointsToNGN} NGN\n`;
    } else if (data.currency === 'GHS') {
      text += `1 Point = ${data.activity2Rates.pointsToGHS} GHS\n`;
    } else if (data.currency === 'USDT') {
      text += `1 Point = ${data.activity2Rates.pointsToUSDT} USDT\n`;
    }
  } else {
    if (data.currency === 'NGN') {
      text += `Points Range | Naira Rewards\n`;
      tiers.forEach(tier => { text += `${tier.range} | ${tier.ngn.toLocaleString()} NGN\n`; });
    } else if (data.currency === 'GHS') {
      text += `Points Range | Cedi Rewards\n`;
      tiers.forEach(tier => { text += `${tier.range} | ${tier.ghs.toLocaleString()} GHS\n`; });
    } else if (data.currency === 'USDT') {
      text += `Points Range | USDT Rewards\n`;
      tiers.forEach(tier => { text += `${tier.range} | ${tier.usdt} USDT\n`; });
    } else {
      text += `Points Range | Naira Rewards | USDT Rewards | Cedi Rewards\n`;
      tiers.forEach(tier => { text += `${tier.range} | ${tier.ngn.toLocaleString()} NGN | ${tier.usdt} USDT | ${tier.ghs} GHS\n`; });
    }
  }

  text += `\n${settings.customNoteEnglish}`;
  return text;
}
