// ============= Safe Calculation Utilities =============
// NaN-safe calculation functions for production stability

/**
 * 安全转换为数字，无效值返回默认值
 */
export const safeNumber = (val: any, fallback = 0): number => {
  if (val === null || val === undefined || val === '') {
    return fallback;
  }
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
};

/**
 * 安全除法，除数为0或无效时返回默认值
 */
export const safeDivide = (a: number | any, b: number | any, fallback = 0): number => {
  const numA = safeNumber(a);
  const numB = safeNumber(b);
  
  if (numB === 0 || !Number.isFinite(numA) || !Number.isFinite(numB)) {
    return fallback;
  }
  
  const result = numA / numB;
  return Number.isFinite(result) ? result : fallback;
};

/**
 * 安全乘法，无效值自动过滤
 */
export const safeMultiply = (...vals: (number | any)[]): number => {
  if (vals.length === 0) return 0;
  
  return vals.reduce((acc, v) => {
    const num = safeNumber(v, 1);
    if (!Number.isFinite(num)) return acc;
    return acc * num;
  }, 1);
};

/**
 * 安全加法
 */
export const safeAdd = (...vals: (number | any)[]): number => {
  return vals.reduce((acc, v) => {
    const num = safeNumber(v);
    return acc + num;
  }, 0);
};

/**
 * 安全减法
 */
export const safeSubtract = (a: number | any, b: number | any): number => {
  return safeNumber(a) - safeNumber(b);
};

/**
 * 安全百分比计算
 */
export const safePercentage = (value: number | any, total: number | any, fallback = 0): number => {
  return safeDivide(safeNumber(value) * 100, total, fallback);
};

/**
 * 安全格式化数字为固定小数位
 */
export const safeToFixed = (val: any, digits = 2, fallback = '0'): string => {
  const num = safeNumber(val);
  if (!Number.isFinite(num)) return fallback;
  return num.toFixed(digits);
};

/**
 * 安全格式化为货币显示
 */
export const safeCurrency = (val: any, digits = 2): string => {
  const num = safeNumber(val);
  if (!Number.isFinite(num)) return '0.00';
  return num.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
};
