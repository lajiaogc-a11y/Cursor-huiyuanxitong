/**
 * 会员编号生成 — 全项目唯一实现（7 位大写字母+数字）
 * 服务端逻辑见 server/src/utils/memberCode.ts，须保持算法一致
 */
const MEMBER_CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MEMBER_CODE_LENGTH = 7;

export function generateMemberCode(): string {
  let result = '';
  for (let i = 0; i < MEMBER_CODE_LENGTH; i++) {
    result += MEMBER_CODE_CHARS.charAt(Math.floor(Math.random() * MEMBER_CODE_CHARS.length));
  }
  return result;
}

/** 与 generateMemberCode 相同，历史命名保留 */
export function generateMemberId(): string {
  return generateMemberCode();
}
