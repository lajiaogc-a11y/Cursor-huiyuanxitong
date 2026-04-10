/**
 * IP 地理位置查询（外部 API）
 * 从 auth/repository 抽取，避免 repository 层直接发起 HTTP 请求。
 */

function normalizeIp(raw: string | null): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'unknown') return null;
  if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
  return trimmed;
}

export async function resolveIpLocation(ip: string | null): Promise<string | null> {
  const normalized = normalizeIp(ip);
  if (!normalized) return null;
  if (normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost') return 'localhost';
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(normalized)) return 'LAN';
  try {
    const resp = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(normalized)}?fields=status,country,regionName,city&lang=zh-CN`,
      { signal: AbortSignal.timeout(3000) },
    );
    const data = await resp.json() as { status: string; country?: string; regionName?: string; city?: string };
    if (data.status === 'success') {
      const parts = [data.city, data.regionName, data.country].filter(Boolean);
      return parts.join(', ') || null;
    }
    return null;
  } catch {
    return null;
  }
}
