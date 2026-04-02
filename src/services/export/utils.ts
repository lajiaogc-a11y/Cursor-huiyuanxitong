/**
 * 导出导入工具函数
 */

export function escapeCSVField(value: any): string {
  if (value === null || value === undefined) return '';

  let str = String(value);

  if (typeof value === 'object') {
    str = JSON.stringify(value);
  }

  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r') || str.includes('\t')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * UTF-8 CSV Blob（含 BOM 的完整字符串），供 Excel / WPS 正确识别中文。
 * 使用 TextEncoder 输出字节，避免部分环境下字符串 Blob 编码不一致。
 */
export function createUtf8CsvBlob(csvText: string): Blob {
  return new Blob([new TextEncoder().encode(csvText)], { type: 'text/csv;charset=utf-8' });
}

/** 读取 CSV 文件为 UTF-8 文本（识别并去掉 BOM，与导出一致） */
export async function readCsvFileAsUtf8Text(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const u8 = new Uint8Array(buf);
  let start = 0;
  if (u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) start = 3;
  return new TextDecoder('utf-8', { fatal: false }).decode(u8.subarray(start));
}

export function formatDateForFilename(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}_${hour}${minute}`;
}

/**
 * 解析 CSV 文件内容
 */
export function parseCSV(content: string): { headers: string[]; rows: string[][] } {
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  if (lines[0].charCodeAt(0) === 0xFEFF) {
    lines[0] = lines[0].substring(1);
  }

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];

      if (inQuotes) {
        if (char === '"' && nextChar === '"') {
          current += '"';
          i++;
        } else if (char === '"') {
          inQuotes = false;
        } else {
          current += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow);

  return { headers, rows };
}

/**
 * 将科学计数法形式的字符串展开为整数数字串（如 1.38E+10 → 13800000000），避免 Number 精度问题。
 */
export function expandScientificNotationString(input: string): string | null {
  const s = input.trim();
  const m = /^([+-]?)(\d+(?:\.\d+)?)[eE]([+-]?\d+)$/.exec(s);
  if (!m) return null;
  const sign = m[1];
  const mantStr = m[2];
  const exp = parseInt(m[3], 10);
  const [intPart, frac = ''] = mantStr.split('.');
  const digits = intPart + frac;
  if (!/^\d+$/.test(digits)) return null;
  const totalExp = exp - frac.length;
  if (totalExp >= 0) {
    return (sign === '-' ? '-' : '') + digits + '0'.repeat(totalExp);
  }
  if (totalExp <= -digits.length) return null;
  return (sign === '-' ? '-' : '') + digits.slice(0, digits.length + totalExp);
}

/**
 * 导入前规范化：全角/阿拉伯数字、Excel 科学计数法与小数形式等，再交给 cleanPhoneNumber。
 */
export function normalizePhoneInputForImport(raw: unknown): string {
  if (raw == null) return '';

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const r = Math.round(raw);
    if (Math.abs(raw - r) < 1e-6 && Math.abs(r) <= Number.MAX_SAFE_INTEGER) {
      return String(r);
    }
  }

  let s = String(raw).trim();
  if (s === '') return '';

  try {
    s = s.normalize('NFKC');
  } catch {
    /* ignore */
  }

  s = s.replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660));
  s = s.replace(/[\u06f0-\u06f9]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
  s = s.replace(/[\uff10-\uff19]/g, (c) => String(c.charCodeAt(0) - 0xff10));

  if (/^-?\d+\.0+$/.test(s)) {
    s = s.split('.')[0];
  }

  const expanded = expandScientificNotationString(s);
  if (expanded) {
    const body = expanded.startsWith('-') ? expanded.slice(1) : expanded;
    if (/^\d+$/.test(body)) {
      s = body;
    }
  }

  return s.trim();
}

/**
 * 清洗电话号码：移除括号、空格、连字符等非数字字符
 */
export function cleanPhoneNumber(phone: string): string {
  if (!phone) return '';
  return phone.replace(/[^\d+]/g, '').trim();
}

/**
 * 检测表头是否为乱码（无法识别的字符）
 */
export function isGarbledHeader(header: string): boolean {
  if (!header) return true;
  // eslint-disable-next-line no-control-regex -- NUL/C0 controls + replacement char as garbled-only header
  const garbledPattern = /^[?\ufffd\u0000-\u001f]+$/;
  const invalidChars = header.match(/[?\ufffd]/g);
  return garbledPattern.test(header) || (invalidChars != null && invalidChars.length > header.length * 0.3);
}
