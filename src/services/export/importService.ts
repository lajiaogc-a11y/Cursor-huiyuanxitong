/**
 * 数据导入服务
 */

import { apiPost } from '@/api/client';
import { fetchTableCountExact } from '@/lib/tableProxyCount';
import { EXPORTABLE_TABLES } from './tableConfig';
import { parseCSV, escapeCSVField, createUtf8CsvBlob } from './utils';
import { validateImportData } from './validation';
import { batchImportMembers } from './memberImportService';
import { batchImportOrders } from './orderImportService';
import type { ExportFormat } from './types';

async function tableUpsertBatch(tableName: string, batch: Record<string, unknown>[], onConflict: string) {
  await apiPost(`/api/data/table/${encodeURIComponent(tableName)}`, { data: batch, upsert: true, onConflict });
}

async function tableInsertBatch(tableName: string, batch: Record<string, unknown>[]) {
  await apiPost(`/api/data/table/${encodeURIComponent(tableName)}`, { data: batch });
}

async function tableUpsertOne(tableName: string, record: Record<string, unknown>, onConflict: string) {
  await apiPost(`/api/data/table/${encodeURIComponent(tableName)}`, { data: record, upsert: true, onConflict });
}

async function tableInsertOne(tableName: string, record: Record<string, unknown>) {
  await apiPost(`/api/data/table/${encodeURIComponent(tableName)}`, { data: record });
}

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
  tenantId?: string | null,
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
      if (batchResult.warnings.length > 0) {
        result.errors.push(...batchResult.warnings.map((w) => `⚠ ${w}`));
      }
      result.pointsCreated = batchResult.pointsCreated;
      result.success = result.imported > 0 && batchResult.errors.length === 0;
      return result;
    }

    return await importTableFromCSV(tableName, fileContent, isEnglish, mode, currentUserId, currentUserName, tenantId);
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
  currentUserName?: string | null,
  tenantId?: string | null
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
      const batchResult = await batchImportMembers(allRecords, mode, currentUserId || null, tenantId ?? null);
      result.imported = batchResult.imported;
      result.skipped = result.skipped + batchResult.skipped;
      result.errors = batchResult.errors;
      result.success = result.imported > 0 && result.errors.length === 0;
      return result;
    }

    if (tableName === 'orders') {
      const batchResult = await batchImportOrders(allRecords, currentUserId || null, currentUserName);
      result.imported = batchResult.imported;
      result.skipped = result.skipped + batchResult.skipped;
      result.errors = batchResult.errors;
      if (batchResult.warnings.length > 0) {
        result.errors.push(...batchResult.warnings.map((w) => `⚠ ${w}`));
      }
      result.success = result.imported > 0 && batchResult.errors.length === 0;
      return result;
    }

    const BATCH_SIZE = 50;

    if (mode === 'upsert') {
      for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
        const batch = allRecords.slice(i, i + BATCH_SIZE);
        try {
          await tableUpsertBatch(tableName, batch, tableConfig.primaryKey);
          result.imported += batch.length;
        } catch {
          for (let j = 0; j < batch.length; j++) {
            const record = batch[j];
            try {
              await tableUpsertOne(tableName, record, tableConfig.primaryKey);
              result.imported++;
            } catch (singleErr: unknown) {
              const msg = singleErr instanceof Error ? singleErr.message : String(singleErr);
              result.errors.push(`行 ${i + j + 2}: ${msg}`);
              result.skipped++;
            }
          }
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
        try {
          await tableInsertBatch(tableName, batch);
          result.imported += batch.length;
        } catch {
          for (let j = 0; j < batch.length; j++) {
            const record = batch[j];
            try {
              await tableInsertOne(tableName, record);
              result.imported++;
            } catch (singleErr: unknown) {
              const msg = singleErr instanceof Error ? singleErr.message : String(singleErr);
              result.errors.push(`行 ${i + j + 2}: ${msg}`);
              result.skipped++;
            }
          }
        }
      }
    }

    result.success = result.imported > 0 && result.errors.length === 0;
    return result;
  } catch (error) {
    result.errors.push(String(error));
    return result;
  }
}

/** 电话、推荐人电话列：优先用单元格显示文本，减轻 Excel 数值/科学计数法导致的错号 */
function buildPhoneLikeColumnIndices(headers: string[], columnMapping: Record<string, string>): Set<number> {
  const set = new Set<number>();
  for (let j = 0; j < headers.length; j++) {
    const key = columnMapping[headers[j]];
    if (key === 'phone_number' || key === 'referrer_phone') set.add(j);
  }
  return set;
}

/**
 * 将 XLSX 行转为与 parseCSV 一致的 string[][]，便于共用 rowsToRecords
 */
async function xlsxRowsToStringMatrix(
  headers: string[],
  rawRows: any[][],
  worksheet?: any,
  phoneColIndices?: Set<number>,
): Promise<string[][]> {
  const XLSX = await import('xlsx');
  const useCells = worksheet != null && phoneColIndices != null && phoneColIndices.size > 0;
  return rawRows.map((row, ri) =>
    headers.map((_, j) => {
      if (useCells && phoneColIndices!.has(j)) {
        const addr = XLSX.utils.encode_cell({ r: ri + 1, c: j });
        const cell = worksheet![addr];
        if (cell) {
          if (cell.w != null && String(cell.w).trim() !== '') {
            return String(cell.w).trim();
          }
          if (typeof cell.v === 'number' && Number.isFinite(cell.v)) {
            const n = cell.v;
            const r = Math.round(n);
            if (Math.abs(n - r) < 1e-7 && Math.abs(r) <= Number.MAX_SAFE_INTEGER) {
              return String(r);
            }
          }
          if (cell.v != null && cell.v !== '') {
            return String(cell.v).trim();
          }
        }
        return '';
      }
      const v = row?.[j];
      if (v == null || v === '') return '';
      return String(v).trim();
    }),
  );
}

/**
 * 导入 XLSX 文件到指定表（与 CSV 共用校验与 members/orders 批量导入逻辑）
 */
export async function importTableFromXLSX(
  tableName: string,
  file: File,
  isEnglish: boolean = false,
  mode: 'insert' | 'upsert' = 'upsert',
  currentUserId?: string | null,
  currentUserName?: string | null,
  tenantId?: string | null,
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

    const XLSX = await import('xlsx');
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
    const rawRows = jsonData.slice(1) as any[][];

    const validation = validateImportData(tableName, headers, isEnglish);

    if (!validation.valid) {
      result.errors = validation.errors;
      return result;
    }

    const phoneCols = buildPhoneLikeColumnIndices(headers, validation.columnMapping);
    const stringRows = await xlsxRowsToStringMatrix(headers, rawRows, worksheet, phoneCols);

    const allRecords = rowsToRecords(headers, stringRows, validation.columnMapping);
    result.skipped = stringRows.length - allRecords.length;

    if (tableName === 'members') {
      const batchResult = await batchImportMembers(allRecords, mode, currentUserId || null, tenantId ?? null);
      result.imported = batchResult.imported;
      result.skipped = result.skipped + batchResult.skipped;
      result.errors = batchResult.errors;
      result.success = result.imported > 0 && result.errors.length === 0;
      return result;
    }

    if (tableName === 'orders') {
      const batchResult = await batchImportOrders(allRecords, currentUserId || null, currentUserName);
      result.imported = batchResult.imported;
      result.skipped = result.skipped + batchResult.skipped;
      result.errors = batchResult.errors;
      if (batchResult.warnings.length > 0) {
        result.errors.push(...batchResult.warnings.map((w) => `⚠ ${w}`));
      }
      result.success = result.imported > 0 && batchResult.errors.length === 0;
      return result;
    }

    const BATCH_SIZE = 50;

    if (mode === 'upsert') {
      for (let i = 0; i < allRecords.length; i += BATCH_SIZE) {
        const batch = allRecords.slice(i, i + BATCH_SIZE);
        try {
          await tableUpsertBatch(tableName, batch, tableConfig.primaryKey);
          result.imported += batch.length;
        } catch {
          for (let j = 0; j < batch.length; j++) {
            const record = batch[j];
            try {
              await tableUpsertOne(tableName, record, tableConfig.primaryKey);
              result.imported++;
            } catch (singleErr: unknown) {
              const msg = singleErr instanceof Error ? singleErr.message : String(singleErr);
              result.errors.push(`行 ${i + j + 2}: ${msg}`);
              result.skipped++;
            }
          }
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
        try {
          await tableInsertBatch(tableName, batch);
          result.imported += batch.length;
        } catch {
          for (let j = 0; j < batch.length; j++) {
            const record = batch[j];
            try {
              await tableInsertOne(tableName, record);
              result.imported++;
            } catch (singleErr: unknown) {
              const msg = singleErr instanceof Error ? singleErr.message : String(singleErr);
              result.errors.push(`行 ${i + j + 2}: ${msg}`);
              result.skipped++;
            }
          }
        }
      }
    }

    result.success = result.imported > 0 && result.errors.length === 0;
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
    const XLSX = await import('xlsx');
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
      const XLSX = await import('xlsx');
      const ws = XLSX.utils.aoa_to_sheet([headers]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, displayName.slice(0, 31));
      XLSX.writeFile(wb, `${displayName}_模板.xlsx`);
    } else {
      const csvHeaders = headers.map(h => escapeCSVField(h));
      const BOM = '\uFEFF';
      const csvContent = BOM + csvHeaders.join(',');
      const blob = createUtf8CsvBlob(csvContent);
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
  return fetchTableCountExact(tableName);
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
