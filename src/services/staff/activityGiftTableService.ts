/**
 * activity_gifts 表代理：CRUD 操作
 */
import { apiPatch, apiPost, apiDelete } from "@/api/client";

const BASE = "/api/data/table/activity_gifts";

export async function patchActivityGiftRemark(giftId: string, remark: string): Promise<void> {
  await apiPatch(`${BASE}?id=eq.${encodeURIComponent(giftId)}`, { data: { remark } });
}

export async function createActivityGiftRow(data: Record<string, unknown>): Promise<void> {
  await apiPost(BASE, { data });
}

export async function updateActivityGiftRow(id: string, data: Record<string, unknown>): Promise<void> {
  await apiPatch(`${BASE}?id=eq.${encodeURIComponent(id)}`, { data });
}

export async function deleteActivityGiftRow(id: string): Promise<void> {
  await apiDelete(`${BASE}?id=eq.${encodeURIComponent(id)}`);
}
