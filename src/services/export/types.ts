/**
 * 导出导入相关类型定义
 */

// 支持的文件格式
export type ExportFormat = 'csv' | 'xlsx';

// 所有可导出的表定义
export interface TableConfig {
  tableName: string;
  displayName: string;
  displayNameEn: string;
  // 列配置：key = 数据库列名，label = 显示名
  columns: { key: string; label: string; labelEn: string }[];
  // 是否支持导入
  importable: boolean;
  // 主键列名
  primaryKey: string;
}
