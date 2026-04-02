// Exchange Service - 积分兑换逻辑
// 统一管理活动1和活动2的兑换逻辑

import { getActivitySettings, getRewardAmountByPointsAndCurrency } from '@/stores/activitySettingsStore';
import { CurrencyCode } from '@/config/currencies';

// 兑换结果类型
export interface ExchangeResult {
  success: boolean;
  message: string;
  activityType: 'activity_1' | 'activity_2' | null;
  exchangeCurrency: CurrencyCode | null;
  exchangeAmount: number;
  usedPoints: number;
}

// 兑换预览类型
export interface ExchangePreview {
  canExchange: boolean;
  message: string;
  activityType: 'activity_1' | 'activity_2' | null;
  exchangeCurrency: CurrencyCode | null;
  exchangeAmount: number;
  usedPoints: number;
}

/**
 * 检查系统活动开关状态
 * 返回当前生效的活动类型
 */
export function getActiveActivityType(): { 
  type: 'activity_1' | 'activity_2' | null; 
  message: string;
  canExchange: boolean;
} {
  const settings = getActivitySettings();
  const activity1Enabled = settings.activity1Enabled;
  const activity2Enabled = settings.activity2?.enabled || false;
  
  // 互斥检查
  if (activity1Enabled && activity2Enabled) {
    return {
      type: null,
      message: 'Activity configuration error: Both Activity 1 and Activity 2 are enabled. Please contact admin.',
      canExchange: false,
    };
  }
  
  if (!activity1Enabled && !activity2Enabled) {
    return {
      type: null,
      message: 'No exchange activity available',
      canExchange: false,
    };
  }
  
  if (activity1Enabled) {
    return {
      type: 'activity_1',
      message: 'Using Activity 1 (Tiered Exchange)',
      canExchange: true,
    };
  }
  
  return {
    type: 'activity_2',
    message: 'Using Activity 2 (Fixed Points Exchange)',
    canExchange: true,
  };
}

/**
 * 根据需求币种判定实际兑换币种（活动2专用）
 * 规则：
 * - 奈拉 + USDT → 奈拉
 * - 赛地 + USDT → 赛地
 * - 奈拉 → 奈拉
 * - 赛地 → 赛地
 * - USDT → USDT
 */
export function determineExchangeCurrency(preferredCurrencies: string[]): CurrencyCode {
  if (!preferredCurrencies || preferredCurrencies.length === 0) {
    return 'NGN'; // 默认奈拉
  }
  
  // 检查是否包含本地法币
  const hasNGN = preferredCurrencies.some(c => c === 'NGN' || c === '奈拉');
  const hasGHS = preferredCurrencies.some(c => c === 'GHS' || c === '赛地');
  const hasUSDT = preferredCurrencies.some(c => c === 'USDT');
  
  // 优先本地法币
  if (hasNGN) return 'NGN';
  if (hasGHS) return 'GHS';
  if (hasUSDT) return 'USDT';
  
  // 根据第一个偏好决定
  const first = preferredCurrencies[0];
  if (first === 'NGN' || first === '奈拉') return 'NGN';
  if (first === 'GHS' || first === '赛地') return 'GHS';
  if (first === 'USDT') return 'USDT';
  
  return 'NGN';
}

/**
 * 活动2：计算固定积分兑换金额
 */
export function calculateActivity2Amount(points: number, currency: CurrencyCode): number {
  const settings = getActivitySettings();
  const activity2 = settings.activity2;
  
  if (!activity2) return 0;
  
  switch (currency) {
    case 'NGN':
      return points * (activity2.pointsToNGN || 0);
    case 'GHS':
      return points * (activity2.pointsToGHS || 0);
    case 'USDT':
      return points * (activity2.pointsToUSDT || 0);
    default:
      return 0;
  }
}

/**
 * 获取兑换预览信息
 * @param points 当前积分
 * @param preferredCurrencies 会员需求币种列表
 */
export function getExchangePreview(
  points: number, 
  preferredCurrencies: string[]
): ExchangePreview {
  // 步骤1：检查积分
  if (points <= 0) {
    return {
      canExchange: false,
      message: 'Insufficient points for exchange',
      activityType: null,
      exchangeCurrency: null,
      exchangeAmount: 0,
      usedPoints: 0,
    };
  }
  
  // 步骤2：检查活动状态
  const activeActivity = getActiveActivityType();
  if (!activeActivity.canExchange) {
    return {
      canExchange: false,
      message: activeActivity.message,
      activityType: null,
      exchangeCurrency: null,
      exchangeAmount: 0,
      usedPoints: 0,
    };
  }
  
  // 步骤3：根据活动类型计算兑换
  if (activeActivity.type === 'activity_1') {
    // 活动1：阶梯制兑换（保持原有逻辑）
    // 直接使用会员第一个偏好币种
    let exchangeCurrency: CurrencyCode = 'NGN';
    if (preferredCurrencies && preferredCurrencies.length > 0) {
      const first = preferredCurrencies[0];
      if (first === 'NGN' || first === '奈拉') exchangeCurrency = 'NGN';
      else if (first === 'GHS' || first === '赛地') exchangeCurrency = 'GHS';
      else if (first === 'USDT') exchangeCurrency = 'USDT';
    }
    
    const rewardAmount = getRewardAmountByPointsAndCurrency(points, exchangeCurrency);
    
    if (rewardAmount <= 0) {
      return {
        canExchange: false,
        message: 'Current points not in any exchange tier',
        activityType: 'activity_1',
        exchangeCurrency,
        exchangeAmount: 0,
        usedPoints: 0,
      };
    }
    
    return {
      canExchange: true,
      message: `Activity 1 (Tiered): ${points} points = ${rewardAmount} ${exchangeCurrency}`,
      activityType: 'activity_1',
      exchangeCurrency,
      exchangeAmount: rewardAmount,
      usedPoints: points, // 活动1清零所有积分
    };
  } else {
    // 活动2：固定积分兑换
    const exchangeCurrency = determineExchangeCurrency(preferredCurrencies);
    const exchangeAmount = calculateActivity2Amount(points, exchangeCurrency);
    
    if (exchangeAmount <= 0) {
      return {
        canExchange: false,
        message: 'Invalid exchange rate configuration. Please contact admin.',
        activityType: 'activity_2',
        exchangeCurrency,
        exchangeAmount: 0,
        usedPoints: 0,
      };
    }
    
    return {
      canExchange: true,
      message: `Activity 2 (Fixed Rate): ${points} points = ${exchangeAmount.toFixed(2)} ${exchangeCurrency}`,
      activityType: 'activity_2',
      exchangeCurrency,
      exchangeAmount,
      usedPoints: points, // 活动2也清零所有积分
    };
  }
}

/**
 * 检查兑换按钮是否可用
 */
export function canExchange(): boolean {
  const activeActivity = getActiveActivityType();
  return activeActivity.canExchange;
}

/**
 * 获取兑换按钮的禁用提示
 */
export function getExchangeDisabledMessage(): string | null {
  const activeActivity = getActiveActivityType();
  if (activeActivity.canExchange) return null;
  return activeActivity.message;
}
