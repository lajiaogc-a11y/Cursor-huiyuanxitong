/**
 * 平台管理员以只读模式查看租户数据时返回 true
 * 用于禁用编辑/删除等操作，确保租户数据不被平台管理员修改
 */
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";

export function useIsPlatformAdminViewingTenant(): boolean {
  const { employee } = useAuth();
  const { isViewingTenant } = useTenantView() || {};
  return !!(employee?.is_platform_super_admin && isViewingTenant);
}
