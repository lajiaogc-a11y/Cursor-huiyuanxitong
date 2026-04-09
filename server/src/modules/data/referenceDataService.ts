/**
 * Reference Data Service — 业务编排层
 *
 * 封装 repository 中的币种、活动类型、客户来源、交班、审计等参考数据查询
 */
export {
  listCurrenciesRepository as listCurrencies,
  listActivityTypesRepository as listActivityTypes,
  listCustomerSourcesRepository as listCustomerSources,
  listShiftReceiversRepository as listShiftReceivers,
  listShiftHandoversRepository as listShiftHandovers,
  listAuditRecordsRepository as listAuditRecords,
  countPendingAuditRecordsRepository as countPendingAuditRecords,
  listRolePermissionsRepository as listRolePermissions,
  saveRolePermissionsBatch,
} from './repository.js';
