import type { EmployeeInfo } from '@/contexts/AuthContext';

/** 数据库 role_permissions.role：前三档对应 employees.role，总管理员单独一档 */
export type PermissionRole = 'staff' | 'manager' | 'admin' | 'super_admin';

export function resolvePermissionRole(employee: EmployeeInfo | null | undefined): PermissionRole {
  if (!employee) return 'staff';
  if (employee.is_super_admin) return 'super_admin';
  const r = employee.role;
  if (r === 'admin' || r === 'manager' || r === 'staff') return r;
  return 'staff';
}

/** 与侧栏 navKey 对齐；权限设置里配置「可见」即控制菜单与对应路由入口 */
export const NAVIGATION_FIELD_DEFS: Record<
  string,
  { label_zh: string; label_en: string }
> = {
  dashboard: { label_zh: '数据统计', label_en: 'Statistics' },
  exchange_rate: { label_zh: '汇率计算', label_en: 'Exchange Rate' },
  orders: { label_zh: '订单管理', label_en: 'Orders' },
  reports: { label_zh: '报表管理', label_en: 'Reports' },
  activity_reports: { label_zh: '活动报表', label_en: 'Activity Reports' },
  members: { label_zh: '会员管理', label_en: 'Members' },
  merchant_settlement: { label_zh: '商家结算', label_en: 'Merchant Settlement' },
  knowledge_base: { label_zh: '公司文档', label_en: 'Company Docs' },
  work_tasks: { label_zh: '工作任务', label_en: 'Tasks' },
  merchant_management: { label_zh: '商家管理', label_en: 'Merchant Management' },
  audit_center: { label_zh: '审核中心', label_en: 'Audit Center' },
  employees: { label_zh: '员工管理', label_en: 'Employees' },
  member_promotion: { label_zh: '会员等级', label_en: 'Member levels' },
  member_portal_settings: { label_zh: '会员系统', label_en: 'Member Portal' },
  operation_logs: { label_zh: '操作日志', label_en: 'Operation Logs' },
  login_logs: { label_zh: '登录日志', label_en: 'Login Logs' },
  data_management: { label_zh: '数据管理', label_en: 'Data Management' },
  system_settings: { label_zh: '系统设置', label_en: 'System Settings' },
  platform_tenant_management: { label_zh: '租户管理', label_en: 'Tenant Management' },
  platform_tenant_view: { label_zh: '租户数据查看', label_en: 'View Tenant Data' },
  platform_settings: { label_zh: '平台设置', label_en: 'Platform Settings' },
};

/** 无配置时的默认可见菜单（员工/主管）；须与 Sidebar navKey 一致，否则权限页有项而侧栏不显示 */
export const DEFAULT_NAV_FALLBACK_KEYS = new Set([
  'exchange_rate',
  'knowledge_base',
  'operation_logs',
  'login_logs',
  'dashboard',
  'orders',
  'members',
  'member_promotion',
  'reports',
  'merchant_settlement',
  'work_tasks',
]);
