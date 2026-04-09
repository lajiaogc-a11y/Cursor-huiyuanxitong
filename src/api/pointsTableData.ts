/**
 * points_ledger / points_accounts 表代理
 */
import { apiDelete } from './client';

export function deletePointsLedgerByMemberCodesData(inList: string) {
  return apiDelete(`/api/data/table/points_ledger?member_code=in.(${inList})`);
}

export function deletePointsAccountsByMemberCodesData(inList: string) {
  return apiDelete(`/api/data/table/points_accounts?member_code=in.(${inList})`);
}
