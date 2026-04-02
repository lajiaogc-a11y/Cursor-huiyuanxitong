export type DataTable =
  | 'orders'
  | 'members'
  | 'employees'
  | 'points_ledger'
  | 'activity_gifts'
  | 'ledger_transactions'
  | 'member_activity'
  | 'points_accounts'
  | 'payment_providers'
  | 'vendors'
  | 'cards'
  | 'balance_change_logs'
  | 'tasks'
  | 'task_items'
  | 'task_item_logs'
  | 'notifications'
  | 'shared_data_store'
  | 'audit_records'
  | 'operation_logs';

export const TABLE_QUERY_KEYS: Record<DataTable, string[][]> = {
  orders: [
    ['orders'],
    ['usdt-orders'],
    ['dashboard-trend'],
    ['profit-compare-current'],
    ['profit-compare-previous'],
    ['report-filtered'],
    ['activity-data-content'],
    ['member-activity-page-data'],
  ],
  members: [
    ['members'],
    ['dashboard-trend'],
    ['report-base'],
    ['activity-data-content'],
    ['member-activity-page-data'],
    ['activity-report-members-map'],
  ],
  employees: [
    ['employees'],
    ['employees-management'],
  ],
  points_ledger: [
    ['points-ledger'],
    ['activity-data-content'],
    ['member-activity-page-data'],
  ],
  activity_gifts: [
    ['activity-gifts'],
    ['activity-records'],
    ['report-filtered'],
    ['activity-data-content'],
    ['member-activity-page-data'],
  ],
  ledger_transactions: [
    ['merchant-settlement'],
    ['activity-data-content'],
  ],
  member_activity: [
    ['activity-data-content'],
    ['member-activity-page-data'],
  ],
  points_accounts: [
    ['activity-data-content'],
    ['member-activity-page-data'],
  ],
  payment_providers: [
    ['report-base'],
    ['activity-data-content'],
    ['member-activity-page-data'],
  ],
  vendors: [['report-base']],
  cards: [['report-base']],
  balance_change_logs: [
    ['points-ledger'],
    ['merchant-settlement'],
    ['dashboard'],
  ],
  tasks: [['task-progress'], ['open-tasks']],
  task_items: [['task-progress'], ['open-tasks']],
  task_item_logs: [['task-progress'], ['open-tasks']],
  notifications: [['notifications'], ['pending-count']],
  shared_data_store: [
    ['shared-config'],
    ['currency-rates'],
    ['fee-settings'],
    ['dashboard-trend'],
  ],
  audit_records: [['audit-records'], ['audit-pending-count']],
  operation_logs: [['operation-logs']],
};

export const TABLE_LEGACY_EVENTS: Record<DataTable, string[]> = {
  orders: ['report-cache-invalidate', 'leaderboard-refresh', 'points-updated'],
  members: ['member-refresh', 'report-cache-invalidate'],
  employees: ['leaderboard-refresh'],
  points_ledger: ['points-updated'],
  activity_gifts: ['activity-gifts-updated', 'report-cache-invalidate'],
  ledger_transactions: ['ledger-updated', 'balance-log-updated'],
  member_activity: ['member-refresh'],
  points_accounts: ['points-updated'],
  payment_providers: [],
  vendors: [],
  cards: [],
  balance_change_logs: [],
  tasks: ['tasks-updated'],
  task_items: ['tasks-updated'],
  task_item_logs: ['tasks-updated'],
  notifications: ['notifications-updated'],
  shared_data_store: ['shared-data-updated', 'report-cache-invalidate'],
  audit_records: ['audit-records-updated'],
  operation_logs: [],
};

