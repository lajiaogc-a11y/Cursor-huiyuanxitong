// 电话号码验证工具
// 规则：只允许阿拉伯数字，自动去除空格和特殊字符，8-18位

/**
 * 清理电话号码输入
 * - 只保留阿拉伯数字 (0-9)
 * - 自动去除空格、+号和所有特殊字符
 */
export function cleanPhoneNumber(input: string): string {
  // 只保留数字 0-9
  return input.replace(/[^0-9]/g, '');
}

/**
 * 验证电话号码长度
 * - 最少8位
 * - 最多18位
 */
export function validatePhoneLength(phone: string): { valid: boolean; message: string } {
  const length = phone.length;
  
  if (length === 0) {
    return { valid: true, message: '' };
  }
  
  if (length < 8) {
    return { valid: false, message: `至少需要8位数字，当前${length}位` };
  }
  
  if (length > 18) {
    return { valid: false, message: `最多18位数字，当前${length}位` };
  }
  
  return { valid: true, message: '' };
}

/**
 * 处理电话号码输入变化
 * 返回清理后的值
 */
export function handlePhoneInput(value: string): string {
  return cleanPhoneNumber(value);
}
