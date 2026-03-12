import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { preloadTenantEmployeesIntoCache } from "@/hooks/useEmployees";
import { useAuth } from "@/contexts/AuthContext";

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
  const { employee } = useAuth() || {};
  const [viewingTenantId, setViewingTenantId] = useState<string | null>(null);
  const [viewingTenantName, setViewingTenantName] = useState<string | null>(null);
  const [viewingTenantCode, setViewingTenantCode] = useState<string | null>(null);
  const autoSetRef = useRef(false);

  // 租户员工：直接设置 viewingTenantId = employee.tenant_id，不查 tenants 表（避免 RLS 拦截）
  useEffect(() => {
    if (!employee?.tenant_id || viewingTenantId || autoSetRef.current) return;
    const tid = employee.tenant_id;
    autoSetRef.current = true;
    setViewingTenantId(tid);
    setViewingTenantName(null);
    setViewingTenantCode(null);
  }, [employee?.tenant_id, viewingTenantId]);

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
    navigate("/admin/tenants", { replace: true });
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
