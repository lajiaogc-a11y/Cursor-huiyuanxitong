import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { preloadTenantEmployeesIntoCache } from "@/hooks/useEmployees";

interface TenantViewContextType {
  viewingTenantId: string | null;
  viewingTenantName: string | null;
  viewingTenantCode: string | null;
  enterTenant: (tenantId: string, tenantName: string, tenantCode: string) => Promise<void>;
  exitTenant: () => void;
  isViewingTenant: boolean;
}

const TenantViewContext = createContext<TenantViewContextType | undefined>(undefined);

const STORAGE_KEY = "platform_viewing_tenant";

export function TenantViewProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [viewingTenantId, setViewingTenantId] = useState<string | null>(null);
  const [viewingTenantName, setViewingTenantName] = useState<string | null>(null);
  const [viewingTenantCode, setViewingTenantCode] = useState<string | null>(null);

  const enterTenant = useCallback(
    async (tenantId: string, tenantName: string, tenantCode: string) => {
      try {
        await preloadTenantEmployeesIntoCache(tenantId);
      } catch (e) {
        console.warn("[TenantView] Preload employees failed:", e);
      }
      setViewingTenantId(tenantId);
      setViewingTenantName(tenantName);
      setViewingTenantCode(tenantCode);
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ tenantId, tenantName, tenantCode }));
      } catch (_) {}
      navigate("/", { replace: true });
    },
    [navigate]
  );

  const exitTenant = useCallback(() => {
    setViewingTenantId(null);
    setViewingTenantName(null);
    setViewingTenantCode(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
    navigate("/company-management", { replace: true });
  }, [navigate]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const { tenantId, tenantName, tenantCode } = JSON.parse(raw);
        if (tenantId) {
          setViewingTenantId(tenantId);
          setViewingTenantName(tenantName || null);
          setViewingTenantCode(tenantCode || null);
        }
      }
    } catch (_) {}
  }, []);

  return (
    <TenantViewContext.Provider
      value={{
        viewingTenantId,
        viewingTenantName,
        viewingTenantCode,
        enterTenant,
        exitTenant,
        isViewingTenant: !!viewingTenantId,
      }}
    >
      {children}
    </TenantViewContext.Provider>
  );
}

export function useTenantView() {
  const ctx = useContext(TenantViewContext);
  return ctx;
}
