/**
 * points_ledger / points_accounts 表代理：批量清空
 */
import {
  deletePointsLedgerByMemberCodesData,
  deletePointsAccountsByMemberCodesData,
} from "@/api/pointsTableData";

export async function deletePointsLedgerByMemberCodes(inList: string): Promise<void> {
  await deletePointsLedgerByMemberCodesData(inList);
}

export async function deletePointsAccountsByMemberCodes(inList: string): Promise<void> {
  await deletePointsAccountsByMemberCodesData(inList);
}
