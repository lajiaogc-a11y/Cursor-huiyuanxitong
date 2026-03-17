import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import {
  getTenantFeatureFlagResult,
  type FeatureFlagKey,
} from "@/services/featureFlagService";

export function useTenantFeatureFlag(flagKey: FeatureFlagKey, defaultEnabled = true) {
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const tenantId = viewingTenantId || employee?.tenant_id || "";
  const [enabled, setEnabled] = useState(defaultEnabled);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!tenantId) {
      setEnabled(defaultEnabled);
      setLoading(false);
      return;
    }
    setLoading(true);
    const result = await getTenantFeatureFlagResult(tenantId, flagKey, defaultEnabled);
    setEnabled(result.ok ? result.data : defaultEnabled);
    setLoading(false);
  }, [tenantId, flagKey, defaultEnabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(
    () => ({ tenantId, enabled, loading, refresh }),
    [tenantId, enabled, loading, refresh]
  );
}
