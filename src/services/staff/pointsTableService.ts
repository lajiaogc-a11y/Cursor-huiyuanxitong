/**
 * points_ledger / points_accounts 表代理：批量清空
 */
import { apiDelete } from "@/api/client";

export async function deletePointsLedgerByMemberCodes(inList: string): Promise<void> {
  await apiDelete(`/api/data/table/points_ledger?member_code=in.(${inList})`);
}

export async function deletePointsAccountsByMemberCodes(inList: string): Promise<void> {
  await apiDelete(`/api/data/table/points_accounts?member_code=in.(${inList})`);
}
