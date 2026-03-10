/**
 * 数据导入服务
 */

import { supabase } from '@/integrations/supabase/client';
import * as XLSX from 'xlsx';
import { EXPORTABLE_TABLES } from './tableConfig';
import { parseCSV, escapeCSVField } from './utils';
import { validateImportData } from './validation';
import { batchImportMembers } from './memberImportService';
import { batchImportOrders } from './orderImportService';
import type { ExportFormat } from './types';

/**
 * 将 CSV 行转换为记录对象（通用逻辑）
 */
function rowsToRecords(
  headers: string[],
  rows: string[][],
  columnMapping: Record<string, string>
): Record<string, any>[] {
  const allRecords: Record<string, any>[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const record: Record<string, any> = {};

    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const dbColumn = columnMapping[header];
      if (dbColumn && row[j] !== undefined && row[j] !== '') {
        let value: any = row[j];

        if (typeof value === 'string' && (value.startsWith('[') || value.startsWith('{'))) {
          try {
            value = JSON.parse(value);
          } catch {
            // 保持原值
          }
        }

        if (value === 'true' || value === '是') value = true;
        if (value === 'false' || value === '否') value = false;

        record[dbColumn] = value;
      }
    }

    if (Object.keys(record).length > 0) {
      allRecords.push(record);
    }
  }

  return allRecords;
}

/**
 * 导入 CSV 文件到指定表（带进度回调）
 */
export async function importTableFromCSVWithProgress(
  tableName: string,
  fileContent: string,
  isEnglish: boolean = false,
  mode: 'insert' | 'upsert' = 'upsert',
  currentUserId?: string | null,
  currentUserName?: string | null,
  onProgress?: import('./orderImportService').ImportProgressCallback,
  skipPointsCreation: boolean = false
): Promise<{ success: boolean; imported: number; skipped: number; errors: string[]; pointsCreated?: number }> {
  const result = { success: false, imported: 0, skipped: 0, errors: [] as string[], pointsCreated: 0 };

  try {
    const tableConfig = EXPORTABLE_TABLES.find(t => t.tableName === tableName);
    if (!tableConfig) {
      result.errors.push(`未找到表配置: ${tableName}`);
      return result;
    }

    if (!tableConfig.importable) {
      result.errors.push(`表 ${tableConfig.displayName} 不支持导入`);
      return result;
    }

    const { headers, rows } = parseCSV(fileContent);
    const validation = validateImportData(tableName, headers, isEnglish);

    if (!validation.valid) {
      result.errors = validation.errors;
      return result;
    }

    const allRecords = rowsToRecords(headers, rows, validation.columnMapping);
    result.skipped = rows.length - allRecords.length;

    if (tableName === 'orders') {
      const batchResult = await batchImportOrders(allRecords, currentUserId || null, currentUserName, onProgress, skipPointsCreation);
      result.imported = batchResult.imported;
      result.skipped = result.skipped + batchResult.skipped;
      result.errors = batchResult.errors;
      result.pointsCreated = batchResult.pointsCreated;
      result.success = result.imported > 0;
      return result;
    }

    return await importTableFromCSV(tableName, fileContent, isEnglish, mode, currentUserId, currentUserName);
  } catch (error: any) {
    result.errors.push(`导入错误: ${error.message}`);
    return result;
  }
}

/**
 * 导入 CSV 文件到指定表
 */
export async function importTableFromCSV(
  tableName: string,
  fileContent: string,
  isEnglish: boolean = false,
  mode: 'insert' | 'upsert' = 'upsert',
  currentUserId?: string | null,
  currentUserName?: string | null
): Promise<{ success: boolean; imported: number; skipped: number; errors: string[] }> {
  const result = { success: false, imported: 0, skipped: 0, errors: [] as string[] };

  try {
    const tableConfig = EXPORTABLE_TABLES.find(t => t.tableName === tableName);
    if (!tableConfig) {
      result.errors.push(`未找到表配置: ${tableName}`);
      return result;
    }

    if (!tableConfig.importable) {
      result.errors.push(`表 ${tableConfig.displayName} 不支持导入`);
      return result;
    }

    const { headers, rows } = parseCSV(fileContent);
    const validation = validateImportData(tableName, headers, isEnglish);

    if (!validation.valid) {
      result.errors = validation.errors;
      return result;
    }

    const allRecords = rowsToRecords(headers, rows, validation.columnMapping);
    result.skipped = rows.length - allRecords.length;

    if (tableName === 'members') {
      const batchResult = await batchImportMembers(allRecords, mode, currentUserId || null);
      result.imported = batchResult.imported;
      result.skipped = result.skipped + batchResult.skipped;
      result.errors = batchResult.errors;
      result.success = result.imported > 0;
      return result;
    }

    if (tableName === 'orders') {
      const batchResult = await batchImportOrders(allRecords, currentUserId || null, currentUserName);
      result.imported = batchResult.imported;
      result.skipped = result.skipped + batchResult.skipped;
      result.errors = batchResult.errors;
      result.success = result.imported > 0;
      return result;
    }

    const BATCH_SIZE = 50;

    if (mode === 'upsert') {
      for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
        const batch = allRecords.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
          .from(tableName as any)
          .upsert(batch, { onConflict: tableConfig.primaryKey });

        if (error) {
          for (let j = 0; j < batch.length; j++) {
            const record = batch[j];
            const { error: singleError } = await supabase
              .from(tableName as any)
              .upsert(record, { onConflict: tableConfig.primaryKey });

            if (singleError) {
              result.errors.push(`行 ${i + j + 2}: ${singleError.message}`);
              result.skipped++;
            } else {
              result.imported++;
            }
          }
        } else {
          result.imported += batch.length;
        }
      }
    } else {
      const recordsToInsert = allRecords.map(r => {
        const copy = { ...r };
        delete copy.id;
        return copy;
      });

      for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
        const batch = recordsToInsert.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
          .from(tableName as any)
          .insert(batch);

        if (error) {
          for (let j = 0; j < batch.length; j++) {
            const record = batch[j];
            const { error: singleError } = await supabase
              .from(tableName as any)
              .insert(record);

            if (singleError) {
              result.errors.push(`行 ${i + j + 2}: ${singleError.message}`);
              result.skipped++;
            } else {
              result.imported++;
            }
          }
        } else {
          result.imported += batch.length;
        }
      }
    }

    result.success = result.imported > 0;
    return result;
  } catch (error) {
    result.errors.push(String(error));
    return result;
  }
}

/**
 * 导入 XLSX 文件到指定表
 */
export async function importTableFromXLSX(
  tableName: string,
  file: File,
  isEnglish: boolean = false,
  mode: 'insert' | 'upsert' = 'upsert'
): Promise<{ success: boolean; imported: number; skipped: number; errors: string[] }> {
  const result = { success: false, imported: 0, skipped: 0, errors: [] as string[] };

  try {
    const tableConfig = EXPORTABLE_TABLES.find(t => t.tableName === tableName);
    if (!tableConfig) {
      result.errors.push(`未找到表配置: ${tableName}`);
      return result;
    }

    if (!tableConfig.importable) {
      result.errors.push(`表 ${tableConfig.displayName} 不支持导入`);
      return result;
    }

    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { header: 1 });

    if (jsonData.length < 2) {
      result.errors.push('文件为空或只有表头');
      return result;
    }

    const headers = (jsonData[0] as any[]).map(h => String(h || '').trim());
    const rows = jsonData.slice(1) as any[][];

    const validation = validateImportData(tableName, headers, isEnglish);

    if (!validation.valid) {
      result.errors = validation.errors;
      return result;
    }

    const columnMapping = validation.columnMapping;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) {
        result.skipped++;
        continue;
      }

      const record: Record<string, any> = {};

      for (let j = 0; j < headers.length; j++) {
        const header = headers[j];
        const dbColumn = columnMapping[header];
        const cellValue = row[j];

        if (dbColumn && cellValue !== undefined && cellValue !== null && cellValue !== '') {
          let value: any = cellValue;

          if (typeof value === 'string') {
            if (value.startsWith('[') || value.startsWith('{')) {
              try {
                value = JSON.parse(value);
              } catch {
                // 保持原值
              }
            }
            if (value === 'true' || value === '是') value = true;
            if (value === 'false' || value === '否') value = false;
          }

          record[dbColumn] = value;
        }
      }

      if (Object.keys(record).length === 0) {
        result.skipped++;
        continue;
      }

      try {
        if (mode === 'upsert' && record[tableConfig.primaryKey]) {
          const { error } = await supabase
            .from(tableName as any)
            .upsert(record, { onConflict: tableConfig.primaryKey });

          if (error) {
            result.errors.push(`行 ${i + 2}: ${error.message}`);
            result.skipped++;
          } else {
            result.imported++;
          }
        } else {
          delete record.id;

          const { error } = await supabase
            .from(tableName as any)
            .insert(record);

          if (error) {
            result.errors.push(`行 ${i + 2}: ${error.message}`);
            result.skipped++;
          } else {
            result.imported++;
          }
        }
      } catch (err) {
        result.errors.push(`行 ${i + 2}: ${String(err)}`);
        result.skipped++;
      }
    }

    result.success = result.imported > 0;
    return result;
  } catch (error) {
    result.errors.push(String(error));
    return result;
  }
}

/**
 * 解析 XLSX 文件并返回预览信息
 */
export async function parseXLSXForPreview(
  file: File,
  tableName: string,
  isEnglish: boolean = false
): Promise<{ headers: string[]; rowCount: number; validation: ReturnType<typeof validateImportData> } | null> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: 'array' });

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { header: 1 });

    if (jsonData.length === 0) {
      return null;
    }

    const headers = (jsonData[0] as any[]).map(h => String(h || '').trim());
    const rowCount = jsonData.length - 1;
    const validation = validateImportData(tableName, headers, isEnglish);

    return { headers, rowCount, validation };
  } catch (error) {
    console.error('Parse XLSX error:', error);
    return null;
  }
}

/**
 * 下载导入模板（空 XLSX 文件，只有表头）
 */
export async function downloadImportTemplate(
  tableName: string,
  isEnglish: boolean = false,
  format: ExportFormat = 'xlsx'
): Promise<{ success: boolean; error?: string }> {
  try {
    const tableConfig = EXPORTABLE_TABLES.find(t => t.tableName === tableName);
    if (!tableConfig) {
      return { success: false, error: `未找到表配置: ${tableName}` };
    }

    const displayName = isEnglish ? tableConfig.displayNameEn : tableConfig.displayName;
    const headers = tableConfig.columns.map(col => isEnglish ? col.labelEn : col.label);

    if (format === 'xlsx') {
      const ws = XLSX.utils.aoa_to_sheet([headers]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, displayName.slice(0, 31));
      XLSX.writeFile(wb, `${displayName}_模板.xlsx`);
    } else {
      const csvHeaders = headers.map(h => escapeCSVField(h));
      const BOM = '\uFEFF';
      const csvContent = BOM + csvHeaders.join(',');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${displayName}_模板.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * 获取表的当前记录数
 */
export async function getTableRecordCount(tableName: string): Promise<number> {
  try {
    const { count, error } = await supabase
      .from(tableName as any)
      .select('*', { count: 'exact', head: true });

    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

/**
 * 获取所有表的统计信息
 */
export async function getAllTablesStats(): Promise<{ tableName: string; displayName: string; count: number }[]> {
  const stats: { tableName: string; displayName: string; count: number }[] = [];

  for (const table of EXPORTABLE_TABLES) {
    const count = await getTableRecordCount(table.tableName);
    stats.push({
      tableName: table.tableName,
      displayName: table.displayName,
      count,
    });
  }

  return stats;
}
