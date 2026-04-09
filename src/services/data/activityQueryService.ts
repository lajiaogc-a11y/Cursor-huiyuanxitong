import { tableGet, tablePost, tablePatch, tableDelete } from './_tableHelpers';

export function postActivityType(body: unknown) {
  return tablePost<unknown>('activity_types', body);
}

export function patchActivityTypeById(id: string, body: unknown) {
  return tablePatch('activity_types', `id=eq.${encodeURIComponent(id)}`, body);
}

export function deleteActivityTypeById(id: string) {
  return tableDelete('activity_types', `id=eq.${encodeURIComponent(id)}`);
}

export function getActivityGiftIdByGiftNumber(giftNumber: string) {
  return tableGet<{ id?: string } | null>(
    'activity_gifts',
    `select=id&gift_number=eq.${encodeURIComponent(giftNumber)}&single=true`,
  );
}

export function insertActivityGiftRow(body: unknown) {
  return tablePost<Record<string, unknown>>('activity_gifts', body);
}
