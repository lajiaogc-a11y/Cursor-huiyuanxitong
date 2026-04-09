/**
 * points_ledger / points_accounts 表代理：批量清空
 */
import { dataTableApi } from "@/api/data";

export async function deletePointsLedgerByMemberCodes(inList: string): Promise<void> {
  await dataTableApi.del("points_ledger", `member_code=in.(${inList})`);
}

export async function deletePointsAccountsByMemberCodes(inList: string): Promise<void> {
  await dataTableApi.del("points_accounts", `member_code=in.(${inList})`);
}
