/**
 * IPv4 / CIDR 匹配（与 ipAccessControl 中间件一致，供登录白名单等复用）
 */

export function ipToNumber(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (const p of parts) {
    const n = parseInt(p, 10);
    if (Number.isNaN(n) || n < 0 || n > 255) return null;
    num = (num << 8) | n;
  }
  return num >>> 0;
}

export function ipMatchesCidr(ip: string, cidr: string): boolean {
  const rule = cidr.trim();
  if (!rule) return false;
  if (rule === ip) return true;
  const slashIdx = rule.indexOf('/');
  if (slashIdx === -1) return ip === rule;

  const baseIp = rule.substring(0, slashIdx);
  const prefix = parseInt(rule.substring(slashIdx + 1), 10);
  if (Number.isNaN(prefix) || prefix < 0 || prefix > 32) return false;

  const ipNum = ipToNumber(ip);
  const baseNum = ipToNumber(baseIp);
  if (ipNum === null || baseNum === null) return false;

  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  return (ipNum & mask) === (baseNum & mask);
}

export function isPrivateLanIp(ip: string): boolean {
  const num = ipToNumber(ip);
  /** 非 IPv4（如纯 IPv6）不按 RFC1918 豁免，避免误放行 */
  if (num === null) return false;
  if ((num >>> 24) === 127) return true;
  if ((num >>> 24) === 10) return true;
  if ((num >>> 20) === (172 << 4 | 1)) return true;
  if ((num >>> 16) === (192 << 8 | 168)) return true;
  return false;
}

export function ipMatchesAnyRule(clientIp: string, rules: Array<{ ip: string }>): boolean {
  return rules.some((r) => ipMatchesCidr(clientIp, r.ip));
}
