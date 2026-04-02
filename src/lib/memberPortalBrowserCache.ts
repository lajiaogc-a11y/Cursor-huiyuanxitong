/**
 * 会员门户设置 — 浏览器侧可选加速缓存（仅按已登录会员 ID 分桶）。
 *
 * 非业务真源：界面与权限必须以服务端 API（如 getMemberPortalSettingsByMember）为准；
 * 本缓存仅用于减少首屏闪烁、离线极端情况下的上次已知展示；不得用于权限或租户判断。
 * 登出 / 401 须调用 clearMemberPortalSettingsBrowserCaches，避免下一账号误读上一账号皮肤。
 */
import type { MemberPortalSettings } from "@/services/members/memberPortalSettingsService";
import { MEMBER_LOCAL_AVATAR_KEY_PREFIX } from "@/lib/memberPortalLocalAvatar";
import { removeMemberPortalFaviconOverride } from "@/lib/memberPortalFavicon";

/** 历史全局键（未分会员，易串账号）；仅用于清理 */
export const LEGACY_GLOBAL_MEMBER_PORTAL_SETTINGS_KEY = "member_portal_settings_cache";

const CACHE_PREFIX = "member_portal_settings_m:";

export function memberPortalSettingsCacheKey(memberId: string): string {
  return `${CACHE_PREFIX}${memberId}`;
}

export function readMemberPortalSettingsCache(memberId: string | undefined): MemberPortalSettings | null {
  if (!memberId) return null;
  try {
    const raw = localStorage.getItem(memberPortalSettingsCacheKey(memberId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && (parsed as MemberPortalSettings).theme_primary_color) {
      return parsed as MemberPortalSettings;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeMemberPortalSettingsCache(memberId: string, settings: MemberPortalSettings): void {
  try {
    localStorage.setItem(memberPortalSettingsCacheKey(memberId), JSON.stringify(settings));
  } catch {
    /* quota / private mode */
  }
}

/** 401 / 登出时调用：清除遗留全局键及所有按会员分桶的门户展示缓存 */
export function clearMemberPortalSettingsBrowserCaches(): void {
  try {
    localStorage.removeItem(LEGACY_GLOBAL_MEMBER_PORTAL_SETTINGS_KEY);
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (k.startsWith(CACHE_PREFIX) || k.startsWith(MEMBER_LOCAL_AVATAR_KEY_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
  removeMemberPortalFaviconOverride();
}
