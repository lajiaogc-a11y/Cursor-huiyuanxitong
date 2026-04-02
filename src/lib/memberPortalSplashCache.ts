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

/** 与 MemberLogin 的 invite 参数解析一致（首屏同步读缓存时用） */
export function parseInviteFromWindowSearch(search: string): string {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const c =
    q.get("ref") ||
    q.get("invite") ||
    q.get("code") ||
    q.get("invite_code") ||
    q.get("referral") ||
    "";
  return String(c).trim();
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
