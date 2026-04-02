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

interface State {
  tenantId: string | null;
  tenantName: string;
  settings: MemberPortalSettings;
}

function mergeCachedPortalSettings(memberId: string): MemberPortalSettings {
  const cached = readMemberPortalSettingsCache(memberId);
  return cached ? { ...DEFAULT_SETTINGS, ...cached } : DEFAULT_SETTINGS;
}

/**
 * 已登录会员的门户设置：始终以 API 拉取为真源；localStorage 仅按 memberId 分桶作展示加速（见 memberPortalBrowserCache）。
 */
export function useMemberPortalSettings(memberId: string | undefined) {
  const refreshInFlight = useRef(false);
  const [state, setState] = useState<State>(() => ({
    tenantId: null,
    tenantName: "",
    settings: memberId ? mergeCachedPortalSettings(memberId) : DEFAULT_SETTINGS,
  }));
  /** 有 memberId 时首屏为 true，避免启动页在门户请求发出前就误判「已就绪」 */
  const [loading, setLoading] = useState(() => Boolean(memberId));

  /** memberId 切换时立即换桶读缓存，避免短暂展示上一登录会员的门户皮肤 */
  useEffect(() => {
    if (!memberId) {
      setState({ tenantId: null, tenantName: "", settings: DEFAULT_SETTINGS });
      setLoading(false);
      return;
    }
    setState({ tenantId: null, tenantName: "", settings: mergeCachedPortalSettings(memberId) });
    setLoading(true);
  }, [memberId]);

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    if (!memberId) {
      setState({ tenantId: null, tenantName: "", settings: DEFAULT_SETTINGS });
      return;
    }
    if (refreshInFlight.current) return;
    refreshInFlight.current = true;
    if (!silent) setLoading(true);
    try {
      const data = await getMemberPortalSettingsByMember(memberId);
      const newSettings = data.settings;
      setState({
        tenantId: data.tenant_id ?? null,
        tenantName: data.tenant_name,
        settings: newSettings,
      });
      writeMemberPortalSettingsCache(memberId, newSettings);
    } catch {
      // Keep current settings on error instead of resetting to defaults
    } finally {
      if (!silent) setLoading(false);
      refreshInFlight.current = false;
    }
  }, [memberId]);

  /** 下拉刷新已有 PTR 指示器；静默拉门户设置，避免全页骨架与 Tab 切回时「重新加载」观感 */
  useMemberPullRefreshSignal(() => {
    void refresh({ silent: true });
  });

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!memberId) return;

    /** 后台标签页不跑定时刷新，减少无效请求（与会员订单轮询策略一致） */
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
