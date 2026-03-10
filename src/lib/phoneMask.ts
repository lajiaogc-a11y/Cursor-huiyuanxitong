// 电话号码脱敏工具
// 格式: 前三位 + * + 最后五位
// 例如: 08012345678 -> 080***45678

export function maskPhoneNumber(phone: string): string {
  if (!phone || phone.length < 8) {
    return phone;
  }
  
  const prefix = phone.slice(0, 3);
  const suffix = phone.slice(-5);
  const middleLength = phone.length - 8;
  const masked = '*'.repeat(Math.max(middleLength, 1));
  
  return `${prefix}${masked}${suffix}`;
}

// 根据用户角色决定是否显示脱敏号码
// admin 显示完整号码，manager 和 staff 显示脱敏
export function getDisplayPhone(phone: string, isAdmin: boolean): string {
  if (isAdmin) {
    return phone;
  }
  return maskPhoneNumber(phone);
}
