import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memberQueryKeys } from "@/lib/memberQueryKeys";
import {
  DEFAULT_SETTINGS,
  getMemberPortalSettingsByMember,
  type MemberPortalSettings,
} from "@/services/members/memberPortalSettingsService";
import {
  readMemberPortalSettingsCache,
  writeMemberPortalSettingsCache,
} from "@/lib/memberPortalBrowserCache";
import {
  getPlatformBrandLogoUrl,
  mergePlatformBrandLogo,
} from "@/lib/memberPortalPlatformBrandLogo";
import { readMemberPortalSplashBootstrap } from "@/lib/memberPortalSplashCache";

function mergeCachedPortalSettings(memberId: string): MemberPortalSettings {
  const cached = readMemberPortalSettingsCache(memberId);
  if (cached) return { ...DEFAULT_SETTINGS, ...cached };
  const splash = readMemberPortalSplashBootstrap("");
  if (splash?.logo_url) return { ...DEFAULT_SETTINGS, ...splash };
  return DEFAULT_SETTINGS;
}

type PortalSettingsQueryData = {
  tenantId: string | null;
  tenantName: string;
  settings: MemberPortalSettings;
};

/**
 * 已登录会员的门户设置：单一 React Query 缓存键，全应用共享，只发起一次网络请求（直至 invalidate）。
 * localStorage 仍作展示加速与离线回退（见 memberPortalBrowserCache）。
 */
export function useMemberPortalSettings(memberId: string | undefined) {
  const queryClient = useQueryClient();

  const q = useQuery({
    queryKey: memberId ? memberQueryKeys.portalSettings(memberId) : ["member", "portalSettings", "__none"],
    enabled: !!memberId,
    /** 切换 Tab 不触发陈旧重拉；下拉刷新 / 前台恢复等通过 invalidate `memberQueryKeys.all` 统一刷新 */
    staleTime: Infinity,
    queryFn: async (): Promise<PortalSettingsQueryData> => {
      const [platformLogo, data] = await Promise.all([
        getPlatformBrandLogoUrl(),
        getMemberPortalSettingsByMember(memberId!),
      ]);
      const newSettings = mergePlatformBrandLogo(data.settings, platformLogo);
      writeMemberPortalSettingsCache(memberId!, newSettings);
      return {
        tenantId: data.tenant_id ?? null,
        tenantName: data.tenant_name,
        settings: newSettings,
      };
    },
  });

  const refresh = useCallback(
    async (_options?: { silent?: boolean }) => {
      if (!memberId) return;
      await queryClient.invalidateQueries({ queryKey: memberQueryKeys.portalSettings(memberId) });
    },
    [memberId, queryClient],
  );

  const settings: MemberPortalSettings =
    memberId && q.data?.settings
      ? q.data.settings
      : memberId
        ? mergeCachedPortalSettings(memberId)
        : DEFAULT_SETTINGS;

  return {
    tenantName: memberId ? (q.data?.tenantName ?? "") : "",
    settings,
    loading: Boolean(memberId && q.isLoading),
    refresh,
  };
}
