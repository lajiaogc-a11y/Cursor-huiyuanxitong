import { useCallback, useEffect, useMemo, useState } from "react";
import type { MaintenanceStatus } from "@/services/maintenanceModeService";
import { getMaintenanceModeStatusResult } from "@/services/maintenanceModeService";

const DEFAULT_STATUS: MaintenanceStatus = {
  globalEnabled: false,
  globalMessage: null,
  tenantEnabled: false,
  tenantMessage: null,
  effectiveEnabled: false,
  scope: "none",
};

export function useMaintenanceMode(tenantId?: string | null) {
  const [status, setStatus] = useState<MaintenanceStatus>(DEFAULT_STATUS);
  const [fetched, setFetched] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const result = await getMaintenanceModeStatusResult(tenantId);
      if (result.ok) {
        setStatus(result.data);
      }
    } catch {
      // keep defaults on error
    } finally {
      setFetched(true);
    }
  }, [tenantId]);

  useEffect(() => {
    setFetched(false);
    void refresh();
  }, [refresh]);

  return useMemo(() => ({ loading: !fetched, status, refresh }), [fetched, status, refresh]);
}
