/**
 * 全站统一品牌 Logo：与后台「会员门户设置」中最早创建租户（/api/member-portal-settings/default）一致。
 * 该平台基准租户上传 Logo 后，员工端 Chrome 与会员端启动页/登录头等均优先使用该图，避免多租户各配各图。
 */
import type { MemberPortalSettings } from "@/services/members/memberPortalSettingsService";
import { getDefaultMemberPortalSettings } from "@/services/members/memberPortalSettingsService";

let cachedLogo: string | null | undefined;
let inflight: Promise<string | null> | null = null;

/** 内存缓存；整页刷新后重新拉取 */
export function resetPlatformBrandLogoCache(): void {
  cachedLogo = undefined;
  inflight = null;
}

/** 已由其它请求拿到 default 门户设置时写入缓存，避免再打一枪 /default */
export function seedPlatformBrandLogoFromSettings(logoUrl: unknown): void {
  const u = String(logoUrl ?? "").trim();
  cachedLogo = u || null;
}

/**
 * 返回平台基准租户已发布的 logo_url（trim 后非空），无则 null。
 * 并发安全、短期去重为单次请求。
 */
export function getPlatformBrandLogoUrl(): Promise<string | null> {
  if (cachedLogo !== undefined) {
    return Promise.resolve(cachedLogo);
  }
  if (!inflight) {
    inflight = (async () => {
      try {
        const d = await getDefaultMemberPortalSettings();
        const u = String(d?.settings?.logo_url ?? "").trim();
        cachedLogo = u || null;
        return cachedLogo;
      } catch {
        cachedLogo = null;
        return null;
      } finally {
        inflight = null;
      }
    })();
  }
  return inflight;
}

/** 平台有 Logo 时覆盖 tenant 的 logo_url，其余字段不变 */
export function mergePlatformBrandLogo(
  tenant: MemberPortalSettings,
  platformLogoUrl: string | null,
): MemberPortalSettings {
  const p = String(platformLogoUrl ?? "").trim();
  if (!p) return tenant;
  return { ...tenant, logo_url: p };
}
