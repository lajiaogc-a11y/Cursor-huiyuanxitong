/**
 * CSV导出工具函数
 * 支持中英文表头、各种数据类型的格式化
 */

import { formatBeijingTime } from '@/lib/beijingTime';

interface ExportColumn {
  key: string;
  label: string;
  labelEn?: string;
  formatter?: (value: any, row: any) => string;
}

/**
 * 将数据导出为CSV文件
 * @param data 数据数组
 * @param columns 列配置
 * @param filename 文件名(不含扩展名)
 * @param isEnglish 是否使用英文表头
 */
export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  columns: ExportColumn[],
  filename: string,
  isEnglish: boolean = false
): void {
  if (data.length === 0) {
    return;
  }

  // 生成表头
  const headers = columns.map(col => {
    const label = isEnglish ? (col.labelEn || col.label) : col.label;
    // 处理包含逗号或引号的表头
    return escapeCSVField(label);
  });

  // 生成数据行
  const rows = data.map(row => {
    return columns.map(col => {
      const value = row[col.key];
      const formatted = col.formatter ? col.formatter(value, row) : formatValue(value);
      return escapeCSVField(formatted);
    });
  });

  // 添加BOM以支持Excel正确显示中文
  const BOM = '\uFEFF';
  const csvContent = BOM + [headers.join(','), ...rows.map(row => row.join(','))].join('\n');

  // 创建Blob并下载
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}_${formatDateForFilename(new Date())}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 格式化值为字符串
 */
function formatValue(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'number') {
    return value.toString();
  }
  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }
  if (value instanceof Date) {
    return formatBeijingTime(value);
  }
  return String(value);
}

/**
 * 转义CSV字段（处理逗号、引号、换行符）
 */
function escapeCSVField(field: string): string {
  if (field.includes(',') || field.includes('"') || field.includes('\n') || field.includes('\r')) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

/**
 * 格式化日期为文件名格式
 */
function formatDateForFilename(date: Date): string {
  const SHANGHAI = 'Asia/Shanghai';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SHANGHAI,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const g = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  return `${g('year')}${g('month')}${g('day')}_${g('hour')}${g('minute')}`;
}

/**
 * 格式化数字（保留2位小数）
 */
export function formatNumberForExport(num: number | null | undefined): string {
  if (num === null || num === undefined || isNaN(num)) {
    return '0.00';
  }
  return num.toFixed(2);
}

/**
 * 格式化百分比
 */
export function formatPercentForExport(ratio: number | null | undefined): string {
  if (ratio === null || ratio === undefined || isNaN(ratio)) {
    return '0.00%';
  }
  return `${(ratio * 100).toFixed(2)}%`;
}

/**
 * 格式化日期时间
 */
export function formatDateTimeForExport(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return formatBeijingTime(dateStr);
  } catch {
    return dateStr || '';
  }
}

/**
 * PII脱敏工具 - 手机号脱敏
 * 例: 13812345678 -> 138****5678
 */
export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  const str = String(phone).replace(/\s/g, '');
  if (str.length <= 4) return str;
  const visibleStart = Math.min(3, Math.floor(str.length / 3));
  const visibleEnd = Math.min(4, str.length - visibleStart);
  return str.slice(0, visibleStart) + '****' + str.slice(-visibleEnd);
}

/**
 * PII脱敏工具 - 银行卡号脱敏
 * 例: 6222021234567890 -> 6222****7890
 */
export function maskBankCard(card: string | null | undefined): string {
  if (!card) return '';
  const str = String(card).replace(/\s/g, '');
  if (str.length <= 8) return str;
  return str.slice(0, 4) + '****' + str.slice(-4);
}

/**
 * PII脱敏工具 - 姓名脱敏
 * 例: 张三 -> 张*, John Smith -> J*** S****
 */
export function maskName(name: string | null | undefined): string {
  if (!name) return '';
  if (name.length <= 1) return name;
  return name[0] + '*'.repeat(name.length - 1);
}

/**
 * 创建脱敏版本的导出格式化器
 * @param enableMasking 是否启用脱敏
 */
export function createMaskedFormatter(enableMasking: boolean) {
  return {
    phone: (val: any) => enableMasking ? maskPhone(String(val)) : String(val || ''),
    bankCard: (val: any) => enableMasking ? maskBankCard(String(val)) : String(val || ''),
    name: (val: any) => enableMasking ? maskName(String(val)) : String(val || ''),
  };
}
