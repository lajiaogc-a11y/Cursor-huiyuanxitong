/**
 * ip_access_control（data_settings）解析与登录国家/地区策略
 */

export type CountryMode = 'allow' | 'block';

export interface NormalizedIpAccessControl {
  enabled: boolean;
  mode: 'whitelist' | 'blacklist';
  rules: Array<{ ip: string; label?: string }>;
  /** 为 true 时内网/回环也受下方 IP 名单约束（默认 false，与历史行为及租户员工登录白名单一致） */
  enforce_private_lan: boolean;
  country_restrict_login: boolean;
  country_mode: CountryMode;
  country_codes: string[];
}

export function normalizeIpAccessControl(raw: unknown): NormalizedIpAccessControl {
  const v = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const rules = Array.isArray(v.rules)
    ? (v.rules as unknown[]).map((r) => {
        if (r && typeof r === 'object' && 'ip' in (r as object)) {
          const o = r as { ip?: string; label?: string };
          return { ip: String(o.ip || ''), label: o.label ? String(o.label) : undefined };
        }
        return { ip: '' };
      }).filter((r) => r.ip)
    : [];
  const enabled = !!v.enabled;
  const mode = v.mode === 'blacklist' ? 'blacklist' : 'whitelist';

  const hasExplicitCountry =
    typeof v.country_restrict_login === 'boolean' ||
    (Array.isArray(v.country_codes) && (v.country_codes as unknown[]).length > 0) ||
    v.country_mode === 'allow' ||
    v.country_mode === 'block';

  let country_restrict_login = typeof v.country_restrict_login === 'boolean' ? v.country_restrict_login : false;
  let country_mode: CountryMode = v.country_mode === 'allow' ? 'allow' : 'block';
  let country_codes = Array.isArray(v.country_codes)
    ? (v.country_codes as unknown[])
        .map((x) => String(x).trim().toUpperCase())
        .filter((c) => /^[A-Z]{2}$/.test(c))
    : [];

  // 旧版：仅 enabled=true 且无国家字段时，曾走 Edge 仅允许马来西亚
  if (enabled && !hasExplicitCountry) {
    country_restrict_login = true;
    country_mode = 'allow';
    country_codes = ['MY'];
  }

  const enforce_private_lan = typeof v.enforce_private_lan === 'boolean' ? v.enforce_private_lan : false;

  return {
    enabled,
    mode,
    rules,
    enforce_private_lan,
    country_restrict_login,
    country_mode,
    country_codes,
  };
}

export function evaluateCountryLogin(
  countryCode: string | null | undefined,
  norm: NormalizedIpAccessControl
): { allowed: boolean; reason: string } {
  if (!norm.country_restrict_login) {
    return { allowed: true, reason: 'country_restrict_off' };
  }
  const codes = norm.country_codes;
  if (codes.length === 0) {
    return { allowed: true, reason: 'no_country_codes_configured' };
  }
  const cc = (countryCode || '').trim().toUpperCase();
  if (!cc) {
    if (norm.country_mode === 'allow') {
      return { allowed: false, reason: 'unknown_country_deny_allow_mode' };
    }
    return { allowed: true, reason: 'unknown_country_allow_block_mode' };
  }
  if (norm.country_mode === 'allow') {
    return { allowed: codes.includes(cc), reason: codes.includes(cc) ? 'in_allowlist' : 'not_in_allowlist' };
  }
  return { allowed: !codes.includes(cc), reason: codes.includes(cc) ? 'in_blocklist' : 'not_in_blocklist' };
}
