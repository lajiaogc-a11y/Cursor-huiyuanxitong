/** 平台总管理与普通租户员工在有效租户上下文中均可维护订单（含销售/经手人相关字段）。 */
export function canMutateOrderInCurrentView(_input: {
  isPlatformSuperAdmin?: boolean | null;
  isViewingTenant?: boolean | null;
  viewingTenantId?: string | null;
  ownTenantId?: string | null;
}): boolean {
  return true;
}

