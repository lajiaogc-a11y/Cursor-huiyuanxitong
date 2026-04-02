// 电话号码验证工具
// 规则：只允许阿拉伯数字，自动去除空格和特殊字符，8-18位

/**
 * 清理电话号码输入
 * - 只保留阿拉伯数字 (0-9)
 * - 自动去除空格、+号和所有特殊字符
 */
export function cleanPhoneNumber(input: string | number | null | undefined): string {
  return String(input ?? '').replace(/[^0-9]/g, '');
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

/**
 * 将粘贴/上传文件中的多行、CSV（逗号/分号/制表符）转为去重后的纯数字列表，供号码池「标准化并导入」。
 * 与后端 bulkImport 一致：至少 minDigits 位数字；过长片段跳过以免脏数据。
 */
export function normalizeBulkImportPhoneLines(
  raw: string,
  minDigits = 6,
  maxDigits = 24
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/[,;\t|]+/).map((p) => p.trim()).filter(Boolean);
    const chunks = parts.length > 0 ? parts : [trimmed];
    for (const chunk of chunks) {
      const norm = cleanPhoneNumber(chunk);
      if (norm.length < minDigits || norm.length > maxDigits) continue;
      if (seen.has(norm)) continue;
      seen.add(norm);
      out.push(norm);
    }
  }
  return out;
}
