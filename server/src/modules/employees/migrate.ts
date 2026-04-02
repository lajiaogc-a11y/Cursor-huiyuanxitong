/**
 * employees 表列迁移：确保 name/real_name/status/visible 列存在且兼容
 */
import { execute, queryOne } from '../../database/index.js';

async function columnExists(col: string): Promise<boolean> {
  const r = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'employees' AND COLUMN_NAME = ?`,
    [col],
  );
  return Number(r?.c) > 0;
}

export async function migrateEmployeesTable(): Promise<void> {
  if (!(await columnExists('real_name'))) {
    await execute(`ALTER TABLE employees ADD COLUMN real_name VARCHAR(255) NULL AFTER username`);
    if (await columnExists('name')) {
      await execute(`UPDATE employees SET real_name = name WHERE real_name IS NULL`);
    }
  }

  if (await columnExists('name')) {
    try {
      await execute(`ALTER TABLE employees MODIFY COLUMN name VARCHAR(255) NULL DEFAULT NULL`);
    } catch {
      // already nullable
    }
    // 仅当仍有「空 name 且可回填 real_name」时再 UPDATE，避免每次启动全表扫描式更新
    const needsNameBackfill = await queryOne<{ ok: number }>(
      `SELECT 1 AS ok FROM employees
       WHERE (name IS NULL OR TRIM(name) = '')
         AND TRIM(COALESCE(real_name, '')) != ''
       LIMIT 1`,
    );
    if (needsNameBackfill) {
      await execute(`UPDATE employees SET name = COALESCE(real_name, name) WHERE name IS NULL OR name = ''`);
    }
  } else {
    await execute(`ALTER TABLE employees ADD COLUMN name VARCHAR(255) NULL AFTER username`);
    await execute(`UPDATE employees SET name = real_name WHERE name IS NULL`);
  }

  if (!(await columnExists('status'))) {
    await execute(`ALTER TABLE employees ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'active'`);
    if (await columnExists('is_active')) {
      await execute(`UPDATE employees SET status = CASE WHEN is_active = 1 THEN 'active' ELSE 'inactive' END`);
    }
  }

  if (!(await columnExists('visible'))) {
    await execute(`ALTER TABLE employees ADD COLUMN visible TINYINT(1) NOT NULL DEFAULT 1`);
  }
}
