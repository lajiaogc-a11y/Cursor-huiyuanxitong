/**
 * 会员编号生成 — 与前端 src/lib/memberCode.ts 算法须保持一致
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
