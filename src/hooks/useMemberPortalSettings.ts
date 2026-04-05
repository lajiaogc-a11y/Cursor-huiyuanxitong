import { useCallback, useEffect, useRef, useState } from "react";
import { useMemberPullRefreshSignal } from "@/hooks/useMemberPullRefreshSignal";
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

interface State {
  tenantId: string | null;
  tenantName: string;
  settings: MemberPortalSettings;
}

function mergeCachedPortalSettings(memberId: string): MemberPortalSettings {
  const cached = readMemberPortalSettingsCache(memberId);
  if (cached) return { ...DEFAULT_SETTINGS, ...cached };
  const splash = readMemberPortalSplashBootstrap("");
  if (splash?.logo_url) return { ...DEFAULT_SETTINGS, ...splash };
  return DEFAULT_SETTINGS;
}

/**
 * 已登录会员的门户设置：始终以 API 拉取为真源；localStorage 仅按 memberId 分桶作展示加速（见 memberPortalBrowserCache）。
 *
 * Race-condition safe: uses a generation counter so stale responses from a
 * previous memberId (or a slower earlier request) never overwrite the state.
 */
export function useMemberPortalSettings(memberId: string | undefined) {
  const generationRef = useRef(0);
  const refreshInFlight = useRef(false);
  const [state, setState] = useState<State>(() => ({
    tenantId: null,
    tenantName: "",
    settings: memberId ? mergeCachedPortalSettings(memberId) : DEFAULT_SETTINGS,
  }));
  const [loading, setLoading] = useState(() => Boolean(memberId));

  /** memberId 切换时立即换桶读缓存 + 递增 generation 使旧请求失效 */
  useEffect(() => {
    generationRef.current += 1;
    refreshInFlight.current = false;
    if (!memberId) {
      setState({ tenantId: null, tenantName: "", settings: DEFAULT_SETTINGS });
      setLoading(false);
      return;
    }
    setState({ tenantId: null, tenantName: "", settings: mergeCachedPortalSettings(memberId) });
    setLoading(true);
  }, [memberId]);

  /** 平台基准租户 Logo 先到则先写入 settings.logo_url，启动页不必等整包门户接口即可出图 */
  useEffect(() => {
    if (!memberId) return;
    const gen = generationRef.current;
    void getPlatformBrandLogoUrl().then((platformLogo) => {
      if (gen !== generationRef.current || !platformLogo) return;
      setState((s) => ({
        ...s,
        settings: mergePlatformBrandLogo(s.settings, platformLogo),
      }));
    });
  }, [memberId]);

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!memberId) {
      setState({ tenantId: null, tenantName: "", settings: DEFAULT_SETTINGS });
      return;
    }
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    const gen = generationRef.current;
    if (!silent) setLoading(true);
    try {
      const [platformLogo, data] = await Promise.all([
        getPlatformBrandLogoUrl(),
        getMemberPortalSettingsByMember(memberId),
      ]);
      if (gen !== generationRef.current) return;
      const newSettings = mergePlatformBrandLogo(data.settings, platformLogo);
      setState({
        tenantId: data.tenant_id ?? null,
        tenantName: data.tenant_name,
        settings: newSettings,
      });
      writeMemberPortalSettingsCache(memberId, newSettings);
    } catch {
      // Keep current settings on error
    } finally {
      if (gen === generationRef.current) {
        if (!silent) setLoading(false);
        refreshInFlight.current = false;
      }
    }
  }, [memberId]);

  useMemberPullRefreshSignal(() => {
    void refresh({ silent: true });
  });

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!memberId) return;

    const pollTick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void refresh({ silent: true });
    };

    const timer = setInterval(pollTick, 30_000);

    const onFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") void refresh({ silent: true });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh({ silent: true });
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [memberId, refresh]);

  return {
    tenantName: state.tenantName,
    settings: state.settings,
    loading,
    refresh,
  };
}
