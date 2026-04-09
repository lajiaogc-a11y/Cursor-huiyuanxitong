import { tableGet, tablePost, tableDelete } from './_tableHelpers';

export function getReferralRelationsList() {
  return tableGet<unknown>('referral_relations', 'select=*&order=created_at.desc');
}

export function getReferralRelationIdByRefereePhone(refereePhone: string) {
  return tableGet<{ id: string } | null>(
    'referral_relations',
    `select=id&referee_phone=eq.${encodeURIComponent(refereePhone)}&single=true`,
  );
}

export function postReferralRelation(body: unknown) {
  return tablePost<unknown>('referral_relations', body);
}

export function deleteReferralRelationByRefereePhone(refereePhone: string) {
  return tableDelete(
    'referral_relations',
    `referee_phone=eq.${encodeURIComponent(refereePhone)}`,
  );
}
