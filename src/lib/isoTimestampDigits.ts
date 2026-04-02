/**
 * UTC ISO 时间戳转为 14 位数字 YYYYMMDDHHmmss（等价于去掉 ISO 字符串中的分隔符与 T、Z）。
 * 避免在源码注释中写带方括号的正则字符类，否则 Tailwind JIT 会误扫为任意属性类并生成非法 CSS。
 */
export function isoUtcTimestampDigits14(d: Date = new Date()): string {
  const s = d.toISOString();
  return s.slice(0, 4) + s.slice(5, 7) + s.slice(8, 10) + s.slice(11, 13) + s.slice(14, 16) + s.slice(17, 19);
}
