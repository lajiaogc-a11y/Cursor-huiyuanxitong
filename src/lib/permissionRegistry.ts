/**
 * 权限注册入口（module + field/action）
 * - 定义：`dataFieldPermissionModules.ts` 中的 `DATA_FIELD_MODULES`
 * - 服务端同步键列表：`server/src/permissions/permissionSyncKeys.json`（与定义一致时由脚本重新生成）
 */
export {
  DATA_FIELD_MODULES,
  getAllPermissionModuleFields,
  type FieldMeta,
} from './dataFieldPermissionModules';
