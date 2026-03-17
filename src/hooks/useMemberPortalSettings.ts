import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  getMemberPortalSettingsByMember,
  type MemberPortalSettings,
} from "@/services/members/memberPortalSettingsService";
import { subscribeMemberPortalLiveUpdate } from "@/services/members/memberPortalLiveUpdateService";
import { supabase } from "@/integrations/supabase/client";

interface State {
  tenantId: string | null;
  tenantName: string;
  settings: MemberPortalSettings;
}

export function useMemberPortalSettings(memberId: string | undefined) {
  const [state, setState] = useState<State>({ tenantId: null, tenantName: "", settings: DEFAULT_SETTINGS });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!memberId) {
      setState({ tenantId: null, tenantName: "", settings: DEFAULT_SETTINGS });
      return;
    }
    setLoading(true);
    try {
      const data = await getMemberPortalSettingsByMember(memberId);
      setState({
        tenantId: data.tenant_id ?? null,
        tenantName: data.tenant_name,
        settings: data.settings,
      });
    } catch {
      setState({ tenantId: null, tenantName: "", settings: DEFAULT_SETTINGS });
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!memberId) return;
    const timer = setInterval(() => {
      refresh();
    }, 30000);

    const onFocus = () => refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [memberId, refresh]);

  useEffect(() => {
    if (!memberId) return;
    return subscribeMemberPortalLiveUpdate((payload) => {
      if (payload.type !== "portal_settings_updated") return;
      if (payload.tenantId && state.tenantId && payload.tenantId !== state.tenantId) return;
      void refresh();
    });
  }, [memberId, state.tenantId, refresh]);

  useEffect(() => {
    if (!memberId || !state.tenantId) return;
    const channel = supabase
      .channel(`member-portal-settings-${state.tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "member_portal_settings",
          filter: `tenant_id=eq.${state.tenantId}`,
        },
        () => {
          void refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [memberId, state.tenantId, refresh]);

  return {
    tenantName: state.tenantName,
    settings: state.settings,
    loading,
    refresh,
  };
}
