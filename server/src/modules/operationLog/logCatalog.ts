/**
 * 操作日志 module / action 约定（与权限 registry 的 module 字段对齐，便于对账与扩展）
 */
export const LOG_MODULES = {
  orders: 'orders',
  data_management: 'data_management',
  audit: 'audit',
  member: 'members',
  system_settings: 'system_settings',
} as const;

export type LogModule = (typeof LOG_MODULES)[keyof typeof LOG_MODULES];

export const LOG_ACTIONS = {
  create: 'create',
  update: 'update',
  delete: 'delete',
  batch_delete: 'batch_delete',
  batch_action: 'batch_action',
} as const;

export type LogAction = (typeof LOG_ACTIONS)[keyof typeof LOG_ACTIONS];
