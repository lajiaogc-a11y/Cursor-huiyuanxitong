import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const fetchedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const result = await getMaintenanceModeStatusResult(tenantId);
      if (result.ok) {
        setStatus(result.data);
      }
    } catch {
      // keep defaults on error
    } finally {
      fetchedRef.current = true;
    }
  }, [tenantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(() => ({ loading: false, status, refresh }), [status, refresh]);
}
