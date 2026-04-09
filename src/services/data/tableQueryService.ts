/**
 * Table + RPC query wrappers — hooks call this layer instead of `@/api/data` directly.
 */
import { dataTableApi, dataRpcApi } from '@/api/data';

// --- activity_types ---

export function postActivityType(body: unknown) {
  return dataTableApi.post<unknown>('activity_types', body);
}

export function patchActivityTypeById(id: string, body: unknown) {
  return dataTableApi.patch('activity_types', `id=eq.${encodeURIComponent(id)}`, body);
}

export function deleteActivityTypeById(id: string) {
  return dataTableApi.del('activity_types', `id=eq.${encodeURIComponent(id)}`);
}

// --- permission_versions ---

export function getPermissionVersions(query: string) {
  return dataTableApi.get<unknown>('permission_versions', query);
}

export function postPermissionVersion(body: unknown) {
  return dataTableApi.post<unknown>('permission_versions', body);
}

export function deletePermissionVersionById(versionId: string) {
  return dataTableApi.del(
    'permission_versions',
    `id=eq.${encodeURIComponent(versionId)}`,
  );
}

export function getPermissionVersionByIdQuery(versionId: string) {
  return dataTableApi.get<unknown>(
    'permission_versions',
    `select=*&id=eq.${encodeURIComponent(versionId)}&single=true`,
  );
}

// --- referral_relations ---

export function getReferralRelationsList() {
  return dataTableApi.get<unknown>('referral_relations', 'select=*&order=created_at.desc');
}

export function getReferralRelationIdByRefereePhone(refereePhone: string) {
  return dataTableApi.get<{ id: string } | null>(
    'referral_relations',
    `select=id&referee_phone=eq.${encodeURIComponent(refereePhone)}&single=true`,
  );
}

export function postReferralRelation(body: unknown) {
  return dataTableApi.post<unknown>('referral_relations', body);
}

export function deleteReferralRelationByRefereePhone(refereePhone: string) {
  return dataTableApi.del(
    'referral_relations',
    `referee_phone=eq.${encodeURIComponent(refereePhone)}`,
  );
}

// --- employees (tenant-scoped active list) ---

export function getActiveEmployeesByTenant(tenantId: string) {
  return dataTableApi.get<{ id: string; real_name: string }[]>(
    'employees',
    `select=id,real_name&tenant_id=eq.${encodeURIComponent(tenantId)}&status=eq.active&order=real_name.asc`,
  );
}

// --- member_activity + RPC ---

export interface MemberActivityRow {
  id: string;
  member_id: string;
  phone_number: string;
  accumulated_points: number;
  remaining_points: number;
  referral_count: number;
  referral_points: number;
  last_reset_time: string | null;
  total_accumulated_ngn: number;
  total_accumulated_ghs: number;
  total_accumulated_usdt: number;
  total_gift_ngn: number;
  total_gift_ghs: number;
  total_gift_usdt: number;
  accumulated_profit: number;
  accumulated_profit_usdt: number;
  order_count: number;
}

export function rpcMemberActivityApplyDeltas(params: Record<string, unknown>) {
  return dataRpcApi.call<{ success?: boolean }>('member_activity_apply_deltas', params);
}

export function getMemberActivityByMemberIdSingle(memberId: string) {
  return dataTableApi.get<MemberActivityRow | null>(
    'member_activity',
    `select=*&member_id=eq.${encodeURIComponent(memberId)}&single=true`,
  );
}

export function postMemberActivity(body: unknown) {
  return dataTableApi.post<unknown>('member_activity', body);
}

export function getMemberActivityByPhoneSingle(phoneNumber: string) {
  return dataTableApi.get<MemberActivityRow | null>(
    'member_activity',
    `select=*&phone_number=eq.${encodeURIComponent(phoneNumber)}&single=true`,
  );
}

export function getMemberActivityPermanentTotalsSingle(memberId: string) {
  return dataTableApi.get<Record<string, number | null | undefined> | null>(
    'member_activity',
    `select=total_accumulated_ngn,total_accumulated_ghs,total_accumulated_usdt,total_gift_ngn,total_gift_ghs,total_gift_usdt,accumulated_profit,accumulated_profit_usdt&member_id=eq.${encodeURIComponent(memberId)}&single=true`,
  );
}

// --- audit_records / orders (useAuditRecords) ---

export function getAuditRecordByIdSingle<T>(recordId: string) {
  return dataTableApi.get<T | null>(
    'audit_records',
    `select=*&id=eq.${encodeURIComponent(recordId)}&single=true`,
  );
}

export function getOrderByIdSingle<T>(orderId: string) {
  return dataTableApi.get<T | null>(
    'orders',
    `select=*&id=eq.${encodeURIComponent(orderId)}&single=true`,
  );
}

export function patchAuditRecordById<T>(recordId: string, body: unknown) {
  return dataTableApi.patch<T>(
    'audit_records',
    `id=eq.${encodeURIComponent(recordId)}`,
    body,
  );
}

export function patchDataTableById<T>(table: string, rowId: string, body: unknown) {
  return dataTableApi.patch<T>(table, `id=eq.${encodeURIComponent(rowId)}`, body);
}

// --- permission_change_logs ---

export function listPermissionChangeLogs(limit: number) {
  return dataTableApi.get<unknown[]>(
    'permission_change_logs',
    `select=*&order=changed_at.desc&limit=${limit}`,
  );
}

export function insertPermissionChangeLog(body: unknown) {
  return dataTableApi.post<unknown>('permission_change_logs', body);
}

export function listPermissionChangeLogsByRole(role: string) {
  return dataTableApi.get<unknown>(
    'permission_change_logs',
    `select=*&target_role=eq.${encodeURIComponent(role)}&order=changed_at.desc&limit=50`,
  );
}

// --- points_ledger / points_log / members ---

export function getPointsLedgerAllOrdered() {
  return dataTableApi.get<unknown>('points_ledger', 'select=*&order=created_at.desc');
}

export function getPointsLogAllOrdered() {
  return dataTableApi.get<unknown>('points_log', 'select=*&order=created_at.desc');
}

export type PointsBalanceRow = {
  points_earned?: number | null;
  amount?: number | null;
  id?: string;
};

export function getPointsLedgerByMemberCodeForBalance(memberCode: string, createdAtGtSuffix: string) {
  return dataTableApi.get<PointsBalanceRow[]>(
    'points_ledger',
    `select=id,points_earned,amount,status&member_code=eq.${encodeURIComponent(memberCode)}&status=in.(issued,reversed)${createdAtGtSuffix}`,
  );
}

export function getMembersIdByMemberCode(memberCode: string) {
  return dataTableApi.get<{ id?: string }[]>(
    'members',
    `select=id&member_code=eq.${encodeURIComponent(memberCode)}&limit=1`,
  );
}

export function getPointsLedgerByMemberIdForBalance(memberId: string, createdAtGtSuffix: string) {
  return dataTableApi.get<PointsBalanceRow[]>(
    'points_ledger',
    `select=id,points_earned,amount,status&member_id=eq.${encodeURIComponent(memberId)}&status=in.(issued,reversed)${createdAtGtSuffix}`,
  );
}

// --- operation_logs (table proxy) ---

export function getOperationLogsTableRecent<T>(): Promise<T> {
  return dataTableApi.get<T>('operation_logs', 'select=*&order=timestamp.desc&limit=5000');
}

export function patchOperationLogById(logId: string, body: unknown) {
  return dataTableApi.patch('operation_logs', `id=eq.${encodeURIComponent(logId)}`, body);
}

// --- activity_gifts ---

export function getActivityGiftIdByGiftNumber(giftNumber: string) {
  return dataTableApi.get<{ id?: string } | null>(
    'activity_gifts',
    `select=id&gift_number=eq.${encodeURIComponent(giftNumber)}&single=true`,
  );
}

export function insertActivityGiftRow(body: unknown) {
  return dataTableApi.post<Record<string, unknown>>('activity_gifts', body);
}

// --- role_permissions ---

export function getRolePermissionCanEditRow(
  role: string,
  moduleName: string,
  permissionField: string,
) {
  return dataTableApi.get<{ can_edit?: boolean } | null>(
    'role_permissions',
    `select=can_edit&role=eq.${encodeURIComponent(role)}&module_name=eq.${encodeURIComponent(moduleName)}&field_name=eq.${encodeURIComponent(permissionField)}&single=true`,
  );
}

// --- audit_records ---

export function createAuditRecord(auditData: Record<string, unknown>) {
  return dataTableApi.post<Record<string, unknown>>('audit_records', { data: auditData });
}
