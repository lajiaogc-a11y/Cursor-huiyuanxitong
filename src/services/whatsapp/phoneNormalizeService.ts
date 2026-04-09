/**
 * 手机号标准化 Service
 * 统一处理国际格式、去除空格分隔符，输出 E.164 格式
 */
import { whatsappApi, type NormalizePhoneResult } from '@/api/whatsapp';

export type { NormalizePhoneResult };

const PHONE_CACHE = new Map<string, NormalizePhoneResult>();

export function normalizePhoneLocal(phone: string): string {
  let digits = phone.trim().replace(/[\s\-().]/g, '');
  if (digits.startsWith('00')) digits = '+' + digits.slice(2);
  return digits.replace(/[^\d+]/g, '');
}

export function isValidPhone(phone: string): boolean {
  const norm = normalizePhoneLocal(phone);
  return /^\+?\d{7,15}$/.test(norm);
}

export async function normalizePhoneViaApi(phone: string, countryCode?: string): Promise<NormalizePhoneResult> {
  const cacheKey = `${phone}|${countryCode ?? ''}`;
  const cached = PHONE_CACHE.get(cacheKey);
  if (cached) return cached;

  const result = await whatsappApi.normalizePhone(phone, countryCode);
  PHONE_CACHE.set(cacheKey, result);
  return result;
}

export function clearPhoneCache() { PHONE_CACHE.clear(); }
