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
const SYSTEM_TENANT_CODE = "platform";

export function TenantViewProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { employee } = useAuth() || {};
  const [viewingTenantId, setViewingTenantId] = useState<string | null>(null);
  const [viewingTenantName, setViewingTenantName] = useState<string | null>(null);
  const [viewingTenantCode, setViewingTenantCode] = useState<string | null>(null);
  const autoSetRef = useRef(false);

  // 平台总管理员：登录后默认固定为平台总后台，不自动恢复历史租户查看态
  useEffect(() => {
    if (!employee?.is_platform_super_admin) return;
    setViewingTenantId(null);
    setViewingTenantName(null);
    setViewingTenantCode(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) {}
  }, [employee?.is_platform_super_admin]);

  // 租户员工（非平台总管理）：直接设置 viewingTenantId = employee.tenant_id
  // 平台总管理员即使有 tenant_id 也不自动进入租户，应停留在平台后台
  useEffect(() => {
    if (employee?.is_platform_super_admin) return;
    if (!employee?.tenant_id || viewingTenantId || autoSetRef.current) return;
    const tid = employee.tenant_id;
    autoSetRef.current = true;
    setViewingTenantId(tid);
    setViewingTenantName(null);
    setViewingTenantCode(null);
  }, [employee?.tenant_id, employee?.is_platform_super_admin, viewingTenantId]);

  const enterTenant = useCallback(
    async (tenantId: string, tenantName: string, tenantCode: string) => {
      if (tenantCode === SYSTEM_TENANT_CODE) {
        return;
      }
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
      navigate("/staff", { replace: true });
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
    navigate("/staff/admin/tenants", { replace: true });
  }, [navigate]);

  useEffect(() => {
    // 平台总管理员不从 sessionStorage 恢复，避免刷新后漂移到租户视图
    if (employee?.is_platform_super_admin) return;
    // 租户员工：仅当 sessionStorage 中的 tenantId 与本人所属租户一致时才恢复，避免误用平台管理员的历史
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const { tenantId, tenantName, tenantCode } = JSON.parse(raw);
        if (tenantId && (!employee?.tenant_id || tenantId === employee.tenant_id)) {
          setViewingTenantId(tenantId);
          setViewingTenantName(tenantName || null);
          setViewingTenantCode(tenantCode || null);
        }
      }
    } catch (_) {}
  }, [employee?.is_platform_super_admin, employee?.tenant_id]);

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
