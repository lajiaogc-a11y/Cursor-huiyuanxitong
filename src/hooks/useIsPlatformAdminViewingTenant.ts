/**
 * 平台管理员以只读模式查看**其他**租户数据时返回 true
 * 管理员在自己的租户中操作不受限制，只有通过总后台去查看别的租户才进入只读
 *
 * @param options.allowOperationalMutations 为 true 时，总管理在业务租户视图下仍可改订单/活动赠送等运营数据（不设为只读）
 */
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";

export function useIsPlatformAdminViewingTenant(options?: { allowOperationalMutations?: boolean }): boolean {
  const { employee } = useAuth();
  const { viewingTenantId, isViewingTenant, viewingTenantName } = useTenantView() || {};

  if (!employee?.is_platform_super_admin) return false;
  if (!isViewingTenant || !viewingTenantId) return false;

  let viewingOtherTenant = false;
  if (employee.tenant_id) {
    viewingOtherTenant = viewingTenantId !== employee.tenant_id;
  } else {
    viewingOtherTenant = !!viewingTenantName;
  }

  if (!viewingOtherTenant) return false;

  if (options?.allowOperationalMutations) return false;

  return true;
}
