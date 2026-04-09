/**
 * activity_gifts 表代理：CRUD 操作
 */
import { dataTableApi } from "@/api/data";

const TABLE = "activity_gifts";

export async function patchActivityGiftRemark(giftId: string, remark: string): Promise<void> {
  await dataTableApi.patch(TABLE, `id=eq.${encodeURIComponent(giftId)}`, { data: { remark } });
}

export async function createActivityGiftRow(data: Record<string, unknown>): Promise<void> {
  await dataTableApi.post(TABLE, { data });
}

export async function updateActivityGiftRow(id: string, data: Record<string, unknown>): Promise<void> {
  await dataTableApi.patch(TABLE, `id=eq.${encodeURIComponent(id)}`, { data });
}

export async function deleteActivityGiftRow(id: string): Promise<void> {
  await dataTableApi.del(TABLE, `id=eq.${encodeURIComponent(id)}`);
}
