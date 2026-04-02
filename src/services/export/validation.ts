/**
 * 导入数据校验
 */

import { EXPORTABLE_TABLES } from './tableConfig';
import { isGarbledHeader } from './utils';

/**
 * 验证导入数据结构
 */
export function validateImportData(
  tableName: string,
  headers: string[],
  isEnglish: boolean = false
): { valid: boolean; errors: string[]; columnMapping: Record<string, string>; usedHeuristic?: boolean } {
  const tableConfig = EXPORTABLE_TABLES.find(t => t.tableName === tableName);
  if (!tableConfig) {
    return { valid: false, errors: [`未找到表配置: ${tableName}`], columnMapping: {} };
  }

  if (!tableConfig.importable) {
    return { valid: false, errors: [`表 ${tableConfig.displayName} 不支持导入`], columnMapping: {} };
  }

  const errors: string[] = [];
  const columnMapping: Record<string, string> = {};
  let usedHeuristic = false;

  const labelToKey: Record<string, string> = {};
  for (const col of tableConfig.columns) {
    labelToKey[String(col.label ?? '').toLowerCase()] = col.key;
    labelToKey[String(col.labelEn ?? '').toLowerCase()] = col.key;
    labelToKey[String(col.key ?? '').toLowerCase()] = col.key;
  }

  /** 与列表表头/历史模板兼容的别名列（会员管理） */
  if (tableName === 'members') {
    const extras: Record<string, string> = {
      手机号: 'phone_number',
      会员等级: 'member_level',
      添加时间: 'created_at',
      推荐人: 'referrer_phone',
    };
    for (const [zh, key] of Object.entries(extras)) {
      labelToKey[zh.toLowerCase()] = key;
    }
  }

  for (const header of headers) {
    const raw = header == null ? '' : String(header);
    const normalizedHeader = raw.toLowerCase().trim();
    if (!raw) continue;
    if (labelToKey[normalizedHeader]) {
      columnMapping[raw] = labelToKey[normalizedHeader];
    }
  }

  const mappedKeys = Object.values(columnMapping);

  if (tableName === 'members') {
    const hasPhone = mappedKeys.includes('phone_number');
    const allHeadersGarbled =
      headers.length > 0 && headers.every((h) => isGarbledHeader(h == null ? '' : String(h)));

    if (!hasPhone && headers.length >= 1) {
      usedHeuristic = true;
      columnMapping[headers[0]] = 'phone_number';
      if (headers.length >= 2) columnMapping[headers[1]] = 'member_code';
      if (headers.length >= 3) columnMapping[headers[2]] = 'member_level';
      if (headers.length >= 4) columnMapping[headers[3]] = 'remark';
    }

    const finalMappedKeys = Object.values(columnMapping);
    if (!finalMappedKeys.includes('phone_number')) {
      errors.push(isEnglish
        ? 'Member import must include phone number column'
        : '会员导入必须包含电话号码列');
    }
  } else if (tableName === 'orders') {
    if (Object.keys(columnMapping).length === 0) {
      errors.push(isEnglish
        ? 'Cannot match any column, please check CSV format'
        : '无法匹配任何列，请检查CSV文件格式');
    }
  } else {
    if (!mappedKeys.includes(tableConfig.primaryKey) && !mappedKeys.includes('id')) {
      const hasUniqueIdentifier = mappedKeys.some(k =>
        ['member_code', 'phone_number', 'order_number', 'username', 'code', 'value', 'data_key'].includes(k)
      );
      if (!hasUniqueIdentifier) {
        errors.push(`缺少主键或唯一标识列（${tableConfig.primaryKey}）`);
      }
    }
  }

  if (Object.keys(columnMapping).length === 0) {
    errors.push(isEnglish
      ? 'Cannot match any column, please check CSV format'
      : '无法匹配任何列，请检查CSV文件格式');
  }

  return { valid: errors.length === 0, errors, columnMapping, usedHeuristic };
}
