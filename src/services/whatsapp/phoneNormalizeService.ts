/**
 * 手机号标准化 Service — Step 10 增强版
 *
 * 职责：统一处理手机号格式，提高生产环境命中率
 * 新增能力：
 *   - 国家/地区前缀规则（NG / CN / GH / US / GB / KE …）
 *   - WhatsApp JID 解析（2348012345678@s.whatsapp.net → +2348012345678）
 *   - 多变体生成（用于后端模糊匹配）
 *   - 智能前导零处理
 * 规则：
 *   - 组件层禁止重复实现手机号清洗逻辑，统一走本 service
 *   - 纯逻辑，不发请求，不操作 DOM
 */

// ── 类型 ──

export interface NormalizeResult {
  raw: string;
  normalized: string;
  valid: boolean;
  detectedCountry?: string;
}

export interface PhoneVariants {
  normalized: string;
  digitsOnly: string;
  suffix8: string;
  suffix11: string;
  withPlus: string;
  withoutPlus: string;
}

// ── 国家前缀规则表 ──

interface CountryRule {
  code: string;
  stripLeadingZero: boolean;
  localLengths: number[];
}

const COUNTRY_RULES: Record<string, CountryRule> = {
  NG: { code: '234', stripLeadingZero: true,  localLengths: [10, 11] },
  CN: { code: '86',  stripLeadingZero: false, localLengths: [11] },
  GH: { code: '233', stripLeadingZero: true,  localLengths: [9, 10] },
  KE: { code: '254', stripLeadingZero: true,  localLengths: [9, 10] },
  ZA: { code: '27',  stripLeadingZero: true,  localLengths: [9, 10] },
  US: { code: '1',   stripLeadingZero: false, localLengths: [10] },
  GB: { code: '44',  stripLeadingZero: true,  localLengths: [10, 11] },
};

const COUNTRY_CODE_LIST = Object.values(COUNTRY_RULES).map(r => r.code);

// ── 核心：解析 WhatsApp JID ──

function stripWhatsAppJid(input: string): string {
  return input.replace(/@(s\.whatsapp\.net|c\.us|g\.us)$/i, '').trim();
}

// ── 核心：国家前缀检测 ──

function detectCountryByCode(digits: string): string | undefined {
  for (const [cc, rule] of Object.entries(COUNTRY_RULES)) {
    if (digits.startsWith(rule.code)) return cc;
  }
  return undefined;
}

// ── 核心：本地号码 → E.164 趋近 ──

function tryLocalToE164(local: string, countryHint?: string): string | null {
  const candidates = countryHint
    ? [[countryHint, COUNTRY_RULES[countryHint]] as const].filter(([, r]) => r)
    : Object.entries(COUNTRY_RULES);

  for (const [, rule] of candidates) {
    if (!rule) continue;
    let num = local;
    if (rule.stripLeadingZero && num.startsWith('0')) {
      num = num.slice(1);
    }
    if (rule.localLengths.includes(num.length) || rule.localLengths.includes(local.length)) {
      return '+' + rule.code + num;
    }
  }
  return null;
}

// ── 公开 API ──

/**
 * 标准化手机号
 *
 * 处理流程：
 * 1. 剥离 WhatsApp JID 后缀
 * 2. 去除空格/横线/括号等噪音字符
 * 3. 处理 00 国际前缀 → +
 * 4. 处理无 + 但含国家码的纯数字
 * 5. 尝试本地号码 → E.164 转换
 * 6. 验证长度
 */
export function normalizePhone(rawPhone: string, countryHint?: string): NormalizeResult {
  const raw = rawPhone.trim();
  if (!raw) return { raw, normalized: '', valid: false };

  let cleaned = stripWhatsAppJid(raw);
  cleaned = cleaned.replace(/[\s\-().（）\u200B\u00A0]/g, '');

  if (cleaned.startsWith('00')) {
    cleaned = '+' + cleaned.slice(2);
  }

  const hasPlus = cleaned.startsWith('+');
  const digits = cleaned.replace(/[^\d]/g, '');

  if (!digits) return { raw, normalized: '', valid: false };

  let normalized: string;
  let detectedCountry: string | undefined;

  if (hasPlus) {
    normalized = '+' + digits;
    detectedCountry = detectCountryByCode(digits);
  } else {
    detectedCountry = detectCountryByCode(digits);
    if (detectedCountry && digits.length >= 10) {
      normalized = '+' + digits;
    } else {
      const e164 = tryLocalToE164(digits, countryHint);
      if (e164) {
        normalized = e164;
        detectedCountry = countryHint ?? detectCountryByCode(e164.replace('+', ''));
      } else {
        normalized = digits.length >= 10 ? '+' + digits : digits;
      }
    }
  }

  const valid = /^\+\d{7,15}$/.test(normalized);

  return { raw, normalized, valid, detectedCountry };
}

/**
 * 快捷校验
 */
export function isValidPhone(phone: string): boolean {
  return normalizePhone(phone).valid;
}

/**
 * 提取纯数字
 */
export function phoneDigitsOnly(phone: string): string {
  return normalizePhone(phone).normalized.replace(/\D/g, '');
}

/**
 * 从尾号匹配（取最后 N 位），用于宽松匹配
 */
export function phoneSuffix(phone: string, length = 8): string {
  const digits = phoneDigitsOnly(phone);
  return digits.slice(-length);
}

/**
 * 生成手机号的所有变体，用于后端多条件匹配
 *
 * 如 "+2348012345678" 生成：
 *   normalized:   "+2348012345678"
 *   digitsOnly:   "2348012345678"
 *   suffix8:      "12345678"
 *   suffix11:     "48012345678"
 *   withPlus:     "+2348012345678"
 *   withoutPlus:  "2348012345678"
 */
export function generateVariants(phone: string): PhoneVariants {
  const { normalized } = normalizePhone(phone);
  const digits = normalized.replace(/\D/g, '');
  return {
    normalized,
    digitsOnly: digits,
    suffix8: digits.slice(-8),
    suffix11: digits.slice(-11),
    withPlus: normalized.startsWith('+') ? normalized : '+' + digits,
    withoutPlus: digits,
  };
}

/**
 * 判断两个手机号是否可能为同一号码（宽松匹配）
 * 用于前端侧候选人去重
 */
export function phonesLikelyMatch(a: string, b: string): boolean {
  const sa = phoneSuffix(a, 8);
  const sb = phoneSuffix(b, 8);
  return sa.length >= 7 && sa === sb;
}

export { COUNTRY_RULES, COUNTRY_CODE_LIST };
