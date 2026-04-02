/**
 * 公网 IP → 国家（ip-api.com 免费接口，与 Supabase Edge 行为对齐）
 */

function stripV4Mapped(ip: string): string {
  return ip.replace(/^::ffff:/i, '');
}

export function isPrivateOrLocalIp(ip: string): boolean {
  const s = stripV4Mapped(ip.trim());
  if (!s || s === 'unknown' || s === 'localhost' || s === '::1') return true;
  if (s === '127.0.0.1') return true;
  if (s.startsWith('10.')) return true;
  if (s.startsWith('192.168.')) return true;
  const m = /^172\.(\d{1,3})\./.exec(s);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 16 && n <= 31) return true;
  }
  return false;
}

export async function lookupCountryByIp(ip: string): Promise<{
  country_code: string | null;
  country_name: string | null;
}> {
  const s = stripV4Mapped(ip.trim());
  if (!s || s === 'unknown') {
    return { country_code: null, country_name: null };
  }
  if (isPrivateOrLocalIp(s)) {
    return { country_code: 'MY', country_name: 'Local Network' };
  }

  try {
    const url = `http://ip-api.com/json/${encodeURIComponent(s)}?fields=status,countryCode,country`;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    const res = await fetch(url, { signal: ac.signal });
    clearTimeout(t);
    const data = (await res.json()) as { status?: string; countryCode?: string; country?: string };
    if (data.status === 'success') {
      return {
        country_code: data.countryCode || null,
        country_name: data.country || null,
      };
    }
    return { country_code: null, country_name: null };
  } catch {
    return { country_code: null, country_name: null };
  }
}
