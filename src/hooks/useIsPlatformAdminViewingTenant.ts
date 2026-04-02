/**
 * 平台管理员以只读模式查看**其他**租户数据时返回 true
 * 管理员在自己的租户中操作不受限制，只有通过总后台去查看别的租户才进入只读
 */
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";

export function useIsPlatformAdminViewingTenant(): boolean {
  const { employee } = useAuth();
  const { viewingTenantId, isViewingTenant, viewingTenantName } = useTenantView() || {};

  if (!employee?.is_platform_super_admin) return false;
  if (!isViewingTenant || !viewingTenantId) return false;

  // 管理员有自己的 tenant_id：只有查看不同租户时才只读
  if (employee.tenant_id) {
    return viewingTenantId !== employee.tenant_id;
  }

  // 管理员 tenant_id 为 null（纯平台管理）：
  // 只有通过 enterTenant 显式进入别的租户才只读（此时 viewingTenantName 有值）
  return !!viewingTenantName;
}
