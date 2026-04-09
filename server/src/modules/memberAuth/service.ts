/**
 * Member Auth Service — 会员认证业务逻辑
 * Controller 统一通过此层调用 repository，不得跨层
 */
import {
  verifyMemberPasswordRepository,
  setMemberPasswordRepository,
  getMemberInfoRepository,
  recordMemberLoginRepository,
  bumpMemberLoginSessionRepository,
  getMemberTokenClaimsForSignRepository,
  grantReferralSpinsOnFirstLogin,
} from './repository.js';

export { grantReferralSpinsOnFirstLogin };

export async function verifyMemberPasswordService(phone: string, password: string) {
  return verifyMemberPasswordRepository(phone, password);
}

export async function bumpMemberLoginSessionService(memberId: string): Promise<number> {
  return bumpMemberLoginSessionRepository(memberId);
}

export async function recordMemberLoginService(memberId: string, tenantId: string | null): Promise<void> {
  return recordMemberLoginRepository(memberId, tenantId);
}

export async function setMemberPasswordService(
  memberId: string,
  oldPassword: string | null,
  newPassword: string,
) {
  return setMemberPasswordRepository(memberId, oldPassword, newPassword);
}

export async function getMemberInfoService(memberId: string) {
  return getMemberInfoRepository(memberId);
}

export async function getMemberTokenClaimsService(memberId: string) {
  return getMemberTokenClaimsForSignRepository(memberId);
}
