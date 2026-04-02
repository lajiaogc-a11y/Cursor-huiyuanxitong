/**
 * employee_devices：员工后台登录设备白名单（user_id 对应 employees.id）
 */
import { execute, queryOne } from '../../database/index.js';
import { safeParseJsonColumn } from '../data/repository.js';

async function tableExists(name: string): Promise<boolean> {
  const r = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [name],
  );
  return Number(r?.c) > 0;
}

/**
 * migrateEmployeeDevicesTable 历史上排在 migrateSchemaPatches 之前执行，
 * 会在 data_settings 尚未创建时查询该表导致迁移失败、线上无 employee_devices / 无配置行。
 * 此处幂等补建，兼容已失败过的环境。
 */
async function ensureDataSettingsTable(): Promise<void> {
  if (await tableExists('data_settings')) return;
  await execute(`
    CREATE TABLE data_settings (
      id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
      setting_key VARCHAR(255) NOT NULL UNIQUE,
      setting_value JSON NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function migrateEmployeeDevicesTable(): Promise<void> {
  if (!(await tableExists('employee_devices'))) {
    await execute(`
      CREATE TABLE employee_devices (
        id CHAR(36) NOT NULL PRIMARY KEY,
        employee_id CHAR(36) NOT NULL,
        device_id VARCHAR(128) NOT NULL,
        device_name VARCHAR(255) NULL,
        is_allowed TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_login_at DATETIME NULL,
        last_login_ip VARCHAR(64) NULL,
        UNIQUE KEY uk_employee_device (employee_id, device_id),
        KEY idx_employee_devices_employee (employee_id),
        KEY idx_employee_devices_allowed (employee_id, is_allowed, device_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  }

  await ensureDataSettingsTable();

  const row = await queryOne<{ id: string }>(
    `SELECT id FROM data_settings WHERE setting_key = 'admin_device_whitelist' LIMIT 1`,
  );
  if (!row) {
    const defaultJson = JSON.stringify({ enabled: false, max_devices_per_employee: 5 });
    await execute(
      `INSERT INTO data_settings (id, setting_key, setting_value) VALUES (UUID(), 'admin_device_whitelist', ?)`,
      [defaultJson],
    );
  } else {
    const cur = await queryOne<{ setting_value: unknown }>(
      `SELECT setting_value FROM data_settings WHERE setting_key = 'admin_device_whitelist' LIMIT 1`,
    );
    const parsed = safeParseJsonColumn(cur?.setting_value, 'admin_device_whitelist');
    if (parsed == null || typeof parsed !== 'object') {
      const defaultJson = JSON.stringify({ enabled: false, max_devices_per_employee: 5 });
      await execute(`UPDATE data_settings SET setting_value = ? WHERE setting_key = 'admin_device_whitelist'`, [
        defaultJson,
      ]);
    }
  }
}
