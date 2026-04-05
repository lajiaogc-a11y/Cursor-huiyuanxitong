import { query } from '../../database/index.js';

export async function hasTableColumn(tableName: string, columnName: string): Promise<boolean> {
  const rows = await query<{ col_exists: number }>(
    `SELECT COUNT(*) AS col_exists
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return (rows[0]?.col_exists ?? 0) > 0;
}
