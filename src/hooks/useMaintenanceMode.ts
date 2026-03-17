import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getMaintenanceModeStatusResult,
  type MaintenanceStatus,
} from "@/services/maintenanceModeService";

const DEFAULT_STATUS: MaintenanceStatus = {
  globalEnabled: false,
  globalMessage: null,
  tenantEnabled: false,
  tenantMessage: null,
  effectiveEnabled: false,
  scope: "none",
};

export function useMaintenanceMode(tenantId?: string | null) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<MaintenanceStatus>(DEFAULT_STATUS);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await getMaintenanceModeStatusResult(tenantId ?? null);
    if (result.ok) {
      setStatus(result.data);
    } else {
      setStatus(DEFAULT_STATUS);
    }
    setLoading(false);
  }, [tenantId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(() => ({ loading, status, refresh }), [loading, status, refresh]);
}
