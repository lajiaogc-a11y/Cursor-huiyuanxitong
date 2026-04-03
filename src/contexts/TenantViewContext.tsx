import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { preloadTenantEmployeesIntoCache } from "@/services/employees/employeeHelpers";
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

/** 平台管理员「正在查看的租户」UI 记忆（session 级）。数据与权限仍以 JWT + 服务端校验为准。 */
const STORAGE_KEY = "platform_viewing_tenant";

/** 首屏同步读取，避免 MainLayout 在 useEffect 恢复前误判「未进入租户视图」而强制跳租户管理 */
function readStoredTenantView(): {
  viewingTenantId: string | null;
  viewingTenantName: string | null;
  viewingTenantCode: string | null;
} {
  if (typeof sessionStorage === "undefined") {
    return { viewingTenantId: null, viewingTenantName: null, viewingTenantCode: null };
  }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { viewingTenantId: null, viewingTenantName: null, viewingTenantCode: null };
    const parsed = JSON.parse(raw) as {
      tenantId?: string;
      tenantName?: string | null;
      tenantCode?: string | null;
    };
    if (parsed?.tenantId && typeof parsed.tenantId === "string") {
      return {
        viewingTenantId: parsed.tenantId,
        viewingTenantName: parsed.tenantName ?? null,
        viewingTenantCode: parsed.tenantCode ?? null,
      };
    }
  } catch {
    /* ignore */
  }
  return { viewingTenantId: null, viewingTenantName: null, viewingTenantCode: null };
}

export function TenantViewProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { employee } = useAuth() || {};
  const [viewingTenantId, setViewingTenantId] = useState<string | null>(() => readStoredTenantView().viewingTenantId);
  const [viewingTenantName, setViewingTenantName] = useState<string | null>(() => readStoredTenantView().viewingTenantName);
  const [viewingTenantCode, setViewingTenantCode] = useState<string | null>(() => readStoredTenantView().viewingTenantCode);
  const autoSetRef = useRef(false);

  // 非平台总管理员：不得沿用「查看其他租户」的 session 记忆（同浏览器先总后台进入租户 A，再登录租户员工时，否则会误显示「租户查看模式」）
  useEffect(() => {
    if (!employee) return;
    if (employee.is_platform_super_admin) return;
    const tid = employee.tenant_id;
    if (tid) {
      setViewingTenantId(tid);
      setViewingTenantName(null);
      setViewingTenantCode(null);
    } else {
      setViewingTenantId(null);
      setViewingTenantName(null);
      setViewingTenantCode(null);
    }
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee?.id, employee?.tenant_id, employee?.is_platform_super_admin]);

  // 所有员工（含平台管理员）：自动设置 viewingTenantId = employee.tenant_id
  // FastGC 即是平台租户也是业务租户，平台管理员直接看到自己租户的数据
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
      if (!employee?.is_platform_super_admin) {
        console.warn("[TenantView] enterTenant ignored: not platform super admin");
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
      } catch { /* storage unavailable */ }
      navigate("/staff", { replace: true });
    },
    [navigate, employee?.is_platform_super_admin]
  );

  const exitTenant = useCallback(() => {
    if (!employee?.is_platform_super_admin) {
      if (employee?.tenant_id) {
        setViewingTenantId(employee.tenant_id);
        setViewingTenantName(null);
        setViewingTenantCode(null);
      } else {
        setViewingTenantId(null);
        setViewingTenantName(null);
        setViewingTenantCode(null);
      }
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      navigate("/staff", { replace: true });
      return;
    }
    setViewingTenantId(null);
    setViewingTenantName(null);
    setViewingTenantCode(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) { /* sessionStorage may throw in private browsing mode */ }
    navigate("/staff/admin/tenants", { replace: true });
  }, [navigate, employee?.is_platform_super_admin, employee?.tenant_id]);

  const isViewingTenant = !!viewingTenantId;
  const tenantViewValue = useMemo(
    () => ({
      viewingTenantId,
      viewingTenantName,
      viewingTenantCode,
      enterTenant,
      exitTenant,
      isViewingTenant,
    }),
    [
      viewingTenantId,
      viewingTenantName,
      viewingTenantCode,
      enterTenant,
      exitTenant,
      isViewingTenant,
    ],
  );

  return <TenantViewContext.Provider value={tenantViewValue}>{children}</TenantViewContext.Provider>;
}

export function useTenantView() {
  const ctx = useContext(TenantViewContext);
  return ctx;
}
