import { tableGet } from './_tableHelpers';

export function getPointsLedgerAllOrdered() {
  return tableGet<unknown>('points_ledger', 'select=*&order=created_at.desc');
}

export function getPointsLogAllOrdered() {
  return tableGet<unknown>('points_log', 'select=*&order=created_at.desc');
}

export type PointsBalanceRow = {
  points_earned?: number | null;
  amount?: number | null;
  id?: string;
};

export function getPointsLedgerByMemberCodeForBalance(memberCode: string, createdAtGtSuffix: string) {
  return tableGet<PointsBalanceRow[]>(
    'points_ledger',
    `select=id,points_earned,amount,status&member_code=eq.${encodeURIComponent(memberCode)}&status=in.(issued,reversed)${createdAtGtSuffix}`,
  );
}

export function getMembersIdByMemberCode(memberCode: string) {
  return tableGet<{ id?: string }[]>(
    'members',
    `select=id&member_code=eq.${encodeURIComponent(memberCode)}&limit=1`,
  );
}

export function getPointsLedgerByMemberIdForBalance(memberId: string, createdAtGtSuffix: string) {
  return tableGet<PointsBalanceRow[]>(
    'points_ledger',
    `select=id,points_earned,amount,status&member_id=eq.${encodeURIComponent(memberId)}&status=in.(issued,reversed)${createdAtGtSuffix}`,
  );
}
