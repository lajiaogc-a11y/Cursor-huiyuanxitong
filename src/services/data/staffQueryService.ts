import { tableGet, tablePost, tableDelete } from './_tableHelpers';

export function getPermissionVersions(query: string) {
  return tableGet<unknown>('permission_versions', query);
}

export function postPermissionVersion(body: unknown) {
  return tablePost<unknown>('permission_versions', body);
}

export function deletePermissionVersionById(versionId: string) {
  return tableDelete(
    'permission_versions',
    `id=eq.${encodeURIComponent(versionId)}`,
  );
}

export function getPermissionVersionByIdQuery(versionId: string) {
  return tableGet<unknown>(
    'permission_versions',
    `select=*&id=eq.${encodeURIComponent(versionId)}&single=true`,
  );
}

export function getActiveEmployeesByTenant(tenantId: string) {
  return tableGet<{ id: string; real_name: string }[]>(
    'employees',
    `select=id,real_name&tenant_id=eq.${encodeURIComponent(tenantId)}&status=eq.active&order=real_name.asc`,
  );
}
