import { cleanPhoneNumber } from '@/lib/phoneValidation';

/** 含字母时视为会员编号：去空格并大写；否则视为电话，只保留数字 */
export function normalizeReferralSearchInput(raw: unknown): string {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  if (/[A-Za-z]/.test(t)) {
    return t.replace(/\s+/g, '').toUpperCase();
  }
  return cleanPhoneNumber(t);
}

export type MemberLookupFields = {
  phoneNumber: string;
  memberCode: string;
};

/**
 * 按「电话或会员编号」匹配会员（推荐录入等）
 * - 含字母时先按会员编号匹配，再尝试数字部分匹配电话
 * - 纯数字时按电话号码匹配（双向数字提取比较），同时也匹配纯数字会员编号
 */
export function findMemberByPhoneOrCode<T extends MemberLookupFields>(
  members: T[],
  input: string
): T | undefined {
  const t = String(input ?? '').trim();
  if (!t) return undefined;
  const digits = cleanPhoneNumber(t);
  const codeKey = t.replace(/\s+/g, '').toUpperCase();
  const hasLetters = /[A-Za-z]/.test(t);

  return members.find((m) => {
    const mc = (m.memberCode || '').replace(/\s+/g, '').toUpperCase();
    const pn = (m.phoneNumber || '').trim();
    const pnDigits = cleanPhoneNumber(pn);

    // 会员编号匹配（不区分大小写，去空格）
    if (mc && mc === codeKey) return true;

    // 电话号码匹配：纯数字精确比较（不做模糊尾号匹配，避免误判）
    if (!hasLetters && digits.length > 0) {
      if (pnDigits === digits || pn === digits || pn === t) return true;
    }

    return false;
  });
}
