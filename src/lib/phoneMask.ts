// 电话号码脱敏工具
// 格式: 前三位 + * + 最后五位
// 例如: 08012345678 -> 080***45678

export function maskPhoneNumber(phone: string | number | null | undefined): string {
  // MySQL DECIMAL / JSON 可能把手机号变成 number，必须转字符串再 slice，否则员工端脱敏时报「slice is not a function」
  const s = phone == null ? '' : String(phone).trim();
  if (!s || s.length < 8) {
    return s;
  }

  const prefix = s.slice(0, 3);
  const suffix = s.slice(-5);
  const middleLength = s.length - 8;
  const masked = '*'.repeat(Math.max(middleLength, 1));
  
  return `${prefix}${masked}${suffix}`;
}

// 根据用户角色决定是否显示脱敏号码
// admin 显示完整号码，manager 和 staff 显示脱敏
export function getDisplayPhone(phone: string | number | null | undefined, isAdmin: boolean): string {
  const s = phone == null ? '' : String(phone);
  if (isAdmin) {
    return s;
  }
  return maskPhoneNumber(s);
}
