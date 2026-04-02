export function canMutateOrderInCurrentView(input: {
  isPlatformSuperAdmin?: boolean | null;
  isViewingTenant?: boolean | null;
  viewingTenantId?: string | null;
  ownTenantId?: string | null;
}): boolean {
  const readonly =
    !!input.isPlatformSuperAdmin &&
    !!input.isViewingTenant &&
    !!input.viewingTenantId &&
    input.viewingTenantId !== input.ownTenantId;
  return !readonly;
}

