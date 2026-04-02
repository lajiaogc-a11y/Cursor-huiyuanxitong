/**
 * 员工后台登录：平台国家/地区策略 + 租户 IP 白名单（服务端强制，与前端预检一致）
 */
import { getIpAccessControlSettingRepository, getSharedDataRepository } from '../modules/data/repository.js';
import {
  normalizeIpAccessControl,
  evaluateCountryLogin,
  type NormalizedIpAccessControl,
} from './ipAccessControlConfig.js';
import { lookupCountryByIp } from './ipCountryLookup.js';
import { isPrivateLanIp, ipMatchesAnyRule } from './ipMatch.js';

export const TENANT_STAFF_LOGIN_IP_STORE_KEY = 'tenant_staff_login_ip_allowlist';

export type TenantStaffLoginIpNormalized = {
  enabled: boolean;
  rules: Array<{ ip: string; label?: string }>;
};

export function normalizeTenantStaffLoginIpConfig(raw: unknown): TenantStaffLoginIpNormalized {
  const v = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const rules = Array.isArray(v.rules)
    ? (v.rules as unknown[])
        .map((r) => {
          if (r && typeof r === 'object' && 'ip' in (r as object)) {
            const o = r as { ip?: string; label?: string };
            return { ip: String(o.ip || '').trim(), label: o.label ? String(o.label) : undefined };
          }
          return { ip: '' };
        })
        .filter((r) => r.ip)
    : [];
  return {
    enabled: !!v.enabled,
    rules,
  };
}

/** 写入 DB 前裁剪，避免超大 JSON */
export function sanitizeTenantStaffLoginIpPayloadForStorage(raw: unknown): TenantStaffLoginIpNormalized {
  const norm = normalizeTenantStaffLoginIpConfig(raw);
  const rules = norm.rules
    .slice(0, 200)
    .map((r) => ({
      ip: r.ip.slice(0, 100),
      label: r.label ? r.label.slice(0, 200) : undefined,
    }))
    .filter((r) => r.ip);
  const enabled = !!norm.enabled && rules.length > 0;
  return { enabled, rules };
}

/**
 * 开启且列表非空：须命中规则。内网/回环是否放行与平台「对内网应用 IP 规则」开关一致。
 */
export function evaluateTenantStaffLoginIp(
  clientIp: string,
  norm: TenantStaffLoginIpNormalized,
  enforcePrivateLan = false,
): { allowed: boolean } {
  if (!norm.enabled || norm.rules.length === 0) {
    return { allowed: true };
  }
  if (
    !enforcePrivateLan &&
    (isPrivateLanIp(clientIp) || clientIp === '127.0.0.1' || clientIp === '::1')
  ) {
    return { allowed: true };
  }
  return { allowed: ipMatchesAnyRule(clientIp, norm.rules) };
}

async function evaluatePlatformCountryForStaffLogin(
  clientIp: string,
  preloaded?: NormalizedIpAccessControl,
): Promise<{ allowed: boolean; message?: string }> {
  const norm = preloaded ?? normalizeIpAccessControl(await getIpAccessControlSettingRepository());
  if (!norm.country_restrict_login) {
    return { allowed: true };
  }
  if (norm.country_codes.length === 0) {
    return { allowed: true };
  }
  const loc = await lookupCountryByIp(clientIp);
  const ev = evaluateCountryLogin(loc.country_code, norm);
  if (ev.allowed) {
    return { allowed: true };
  }
  const message =
    norm.country_mode === 'allow'
      ? '当前登录 IP 所在国家/地区不在允许列表中，无法登录员工后台'
      : '当前登录 IP 所在国家/地区被禁止登录员工后台';
  return { allowed: false, message };
}

export async function assertStaffLoginAccessControl(params: {
  clientIp: string | null | undefined;
  employeeTenantId: string | null | undefined;
  isPlatformSuperAdmin: boolean;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const ip = (params.clientIp || '').trim() || '127.0.0.1';

  if (params.isPlatformSuperAdmin) {
    return { ok: true };
  }

  const rawPlatform = await getIpAccessControlSettingRepository();
  const platformNorm = normalizeIpAccessControl(rawPlatform);

  const countryRes = await evaluatePlatformCountryForStaffLogin(ip, platformNorm);
  if (!countryRes.allowed) {
    return { ok: false, message: countryRes.message || '地区策略限制，无法登录' };
  }

  if (params.employeeTenantId) {
    const raw = await getSharedDataRepository(params.employeeTenantId, TENANT_STAFF_LOGIN_IP_STORE_KEY);
    const tnorm = normalizeTenantStaffLoginIpConfig(raw);
    const tev = evaluateTenantStaffLoginIp(ip, tnorm, platformNorm.enforce_private_lan);
    if (!tev.allowed) {
      return {
        ok: false,
        message: '当前 IP 不在本租户「员工登录 IP 白名单」中，无法登录后台',
      };
    }
  }

  return { ok: true };
}
