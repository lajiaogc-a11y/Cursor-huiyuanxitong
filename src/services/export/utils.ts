/**
 * 导出导入工具函数
 */

export function escapeCSVField(value: any): string {
  if (value === null || value === undefined) return '';

  let str = String(value);

  if (typeof value === 'object') {
    str = JSON.stringify(value);
  }

  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
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
  const garbledPattern = /^[\?\ufffd\u0000-\u001f]+$/;
  const invalidChars = header.match(/[\?\ufffd]/g);
  return garbledPattern.test(header) || (invalidChars && invalidChars.length > header.length * 0.3);
}
