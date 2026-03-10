/**
 * 数据导入导出服务
 * 支持 CSV 和 XLSX 格式的表级别导入导出和全平台数据导出
 * 用于数据备份、迁移和系统切换
 *
 * 本文件为 facade，实际实现已拆分至 services/export/
 */

export {
  type ExportFormat,
  type TableConfig,
  EXPORTABLE_TABLES,
  exportTableToCSV,
  exportTableToXLSX,
  exportTable,
  exportAllTables,
  validateImportData,
  importTableFromCSV,
  importTableFromCSVWithProgress,
  importTableFromXLSX,
  parseXLSXForPreview,
  downloadImportTemplate,
  getTableRecordCount,
  getAllTablesStats,
  type ImportProgress,
  type ImportProgressCallback,
} from './export';
