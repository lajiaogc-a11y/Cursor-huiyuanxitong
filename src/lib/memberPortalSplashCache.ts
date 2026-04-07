import type { MemberPortalSettings } from "@/services/members/memberPortalSettingsService";

const STORAGE_PREFIX = "member_portal_splash_v1:";

export type MemberPortalSplashPayload = Pick<
  MemberPortalSettings,
  "logo_url" | "company_name" | "theme_primary_color"
>;

function keyForScope(inviteOrRefCode: string): string {
  const code = String(inviteOrRefCode || "").trim();
  return `${STORAGE_PREFIX}${code ? `invite:${code}` : "default"}`;
}

function readKey(fullKey: string): Partial<MemberPortalSettings> | null {
  try {
    const raw = sessionStorage.getItem(fullKey) ?? localStorage.getItem(fullKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const o = parsed as Record<string, unknown>;
    const out: Partial<MemberPortalSettings> = {};
    if (typeof o.company_name === "string" && o.company_name.trim()) {
      out.company_name = o.company_name.trim();
    }
    if (o.logo_url === null) out.logo_url = null;
    else if (typeof o.logo_url === "string") out.logo_url = o.logo_url.trim() || null;
    const tc = String(o.theme_primary_color ?? "").trim();
    if (/^#[0-9A-Fa-f]{6}$/i.test(tc)) out.theme_primary_color = tc;
    return Object.keys(out).length ? out : null;
  } catch {
    return null;
  }
}

/**
 * 与 MemberLogin 一致：推广/注册链接上可能出现的邀请码 query 键（缺一会导致落在 /member/register 手工填码）。
 */
export function getInviteCodeFromSearchParams(q: URLSearchParams): string {
  const c =
    q.get("ref") ||
    q.get("invite") ||
    q.get("code") ||
    q.get("invite_code") ||
    q.get("referral") ||
    "";
  return String(c).trim();
}

/** 与 MemberLogin 的 invite 参数解析一致（首屏同步读缓存时用） */
export function parseInviteFromWindowSearch(search: string): string {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return getInviteCodeFromSearchParams(q);
}

/**
 * 邀请码：先读 query（ref / invite / code …），再读路径 `/invite/:code`（分享直连落地页）。
 * 供懒加载 Suspense 首帧读 splash 缓存，避免仅认 search 时 `/invite/xxx` 拿不到租户品牌。
 */
export function parseInviteCodeFromWindowLocation(): string {
  if (typeof window === "undefined") return "";
  const fromQuery = getInviteCodeFromSearchParams(new URLSearchParams(window.location.search));
  if (fromQuery) return fromQuery;
  const rawPath = (window.location.pathname || "").replace(/\/+$/, "");
  const segs = rawPath.split("/").filter(Boolean);
  if (segs.length >= 2 && segs[0].toLowerCase() === "invite") {
    try {
      return decodeURIComponent(segs[1]).trim();
    } catch {
      return segs[1].trim();
    }
  }
  return "";
}

/**
 * 登录 splash 首屏：带邀请码时优先该码下缓存，否则用 default；无邀请码只读 default。
 */
export function readMemberPortalSplashBootstrap(inviteOrRefCode: string): Partial<MemberPortalSettings> | null {
  const code = String(inviteOrRefCode || "").trim();
  const fromInvite = code ? readKey(keyForScope(code)) : null;
  const fromDefault = readKey(keyForScope(""));
  if (!fromInvite && !fromDefault) return null;
  return { ...fromDefault, ...fromInvite };
}

export function persistMemberPortalSplashCache(
  inviteOrRefCode: string,
  settings: MemberPortalSettings,
): void {
  const payload: MemberPortalSplashPayload = {
    logo_url: settings.logo_url,
    company_name: settings.company_name,
    theme_primary_color: settings.theme_primary_color,
  };
  const s = JSON.stringify(payload);
  try {
    sessionStorage.setItem(keyForScope(inviteOrRefCode), s);
  } catch {
    /* quota / private mode */
  }
  try {
    localStorage.setItem(keyForScope(inviteOrRefCode), s);
  } catch {
    /* quota / private mode */
  }
}
