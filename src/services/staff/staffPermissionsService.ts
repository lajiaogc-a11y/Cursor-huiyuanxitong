/**
 * Staff Permissions Service — 员工权限数据访问
 *
 * 架构: Context/Hook → Service(此文件) → API(@/api/staffData)
 */
import { getRolePermissions as getRolePermissionsApi } from '@/api/staffData';

export interface RolePermissionRow {
  id: string;
  role: string;
  module_name: string;
  field_name: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

export async function getStaffRolePermissions(): Promise<RolePermissionRow[]> {
  return getRolePermissionsApi();
}
