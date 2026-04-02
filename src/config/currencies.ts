// 全局币种配置 - 统一管理所有币种相关定义

export type CurrencyCode = 'NGN' | 'GHS' | 'USDT';

export interface Currency {
  code: CurrencyCode;
  name: string;        // 中文名称
  englishName: string; // 英文名称
  symbol: string;      // 符号
  badgeColor: string;  // Badge样式类
  color: string;       // 主题颜色（hex）
}

// 系统支持的三种币种
export const CURRENCIES: Record<CurrencyCode, Currency> = {
  NGN: {
    code: 'NGN',
    name: '奈拉',
    englishName: 'Naira',
    symbol: '₦',
    badgeColor: 'bg-orange-100 text-orange-700 border-orange-200',
    color: '#f97316',
  },
  GHS: {
    code: 'GHS',
    name: '赛地',
    englishName: 'Cedi',
    symbol: '₵',
    badgeColor: 'bg-green-100 text-green-700 border-green-200',
    color: '#22c55e',
  },
  USDT: {
    code: 'USDT',
    name: 'USDT',
    englishName: 'USDT',
    symbol: '$',
    badgeColor: 'bg-blue-100 text-blue-700 border-blue-200',
    color: '#3b82f6',
  },
};

// 币种列表（用于下拉选择）
export const CURRENCY_LIST: Currency[] = Object.values(CURRENCIES);

// 币种代码列表
export const CURRENCY_CODES: CurrencyCode[] = ['NGN', 'GHS', 'USDT'];

// 获取币种显示名称（支持中英文）
export function getCurrencyDisplayName(code: CurrencyCode, locale: 'zh' | 'en' = 'zh'): string {
  const currency = CURRENCIES[code];
  return locale === 'zh' ? currency.name : currency.englishName;
}

// 获取币种Badge样式
export function getCurrencyBadgeColor(code: string): string {
  const currency = CURRENCIES[code as CurrencyCode];
  return currency?.badgeColor || 'bg-gray-100 text-gray-700 border-gray-200';
}

// 旧代码兼容：将旧的币种名称映射到新的代码
export function normalizeCurrencyCode(value: string | null | undefined): CurrencyCode | null {
  if (value == null || value === '') return null;
  const trimmedValue = String(value).trim();
  const upperValue = trimmedValue.toUpperCase();
  
  // 直接匹配代码
  if (upperValue === 'NGN' || upperValue === 'NAIRA' || trimmedValue === '奈拉') {
    return 'NGN';
  }
  if (upperValue === 'GHS' || upperValue === 'CEDI' || trimmedValue === '赛地' || trimmedValue === '赛迪') {
    return 'GHS';
  }
  if (upperValue === 'USDT') {
    return 'USDT';
  }
  
  return null;
}

// 根据币种代码获取中文名（用于订单等显示）
export function getCurrencyChineseName(code: CurrencyCode): string {
  return CURRENCIES[code].name;
}
