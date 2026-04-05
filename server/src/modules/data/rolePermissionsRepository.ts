/**
 * Data repository — role_permissions
 */
import { query, queryOne, execute } from '../../database/index.js';

export interface RolePermissionRow {
  id: string;
  role: string;
  module_name: string;
  field_name: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

let _rpTableFixed = false;

async function ensureRolePermissionsTable(): Promise<void> {
  if (_rpTableFixed) return;
  try {
    const cols = await query<{ Field: string }>('SHOW COLUMNS FROM role_permissions');
    const colNames = new Set(cols.map(c => c.Field));

    if (!colNames.has('module_name')) {
      await execute(`ALTER TABLE role_permissions ADD COLUMN module_name VARCHAR(100) NULL`);
    }
    if (!colNames.has('field_name')) {
      await execute(`ALTER TABLE role_permissions ADD COLUMN field_name VARCHAR(100) NULL`);
    }
    if (!colNames.has('can_view')) {
      await execute(`ALTER TABLE role_permissions ADD COLUMN can_view TINYINT(1) NOT NULL DEFAULT 1`);
    }
    if (!colNames.has('can_edit')) {
      await execute(`ALTER TABLE role_permissions ADD COLUMN can_edit TINYINT(1) NOT NULL DEFAULT 0`);
    }
    if (!colNames.has('can_delete')) {
      await execute(`ALTER TABLE role_permissions ADD COLUMN can_delete TINYINT(1) NOT NULL DEFAULT 0`);
    }

    if (colNames.has('permission')) {
      try {
        await execute(`ALTER TABLE role_permissions MODIFY COLUMN permission VARCHAR(255) NULL DEFAULT ''`);
      } catch { /* column may already have correct type */ }
    }

    try {
      await execute(
        `ALTER TABLE role_permissions ADD UNIQUE INDEX uk_role_module_field (role, module_name, field_name)`
      );
    } catch { /* index may already exist */ }

    _rpTableFixed = true;
  } catch (e) {
    await execute(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id CHAR(36) NOT NULL PRIMARY KEY,
        role VARCHAR(50) NOT NULL,
        permission VARCHAR(255) NULL DEFAULT '',
        module_name VARCHAR(100) NULL,
        field_name VARCHAR(100) NULL,
        can_view TINYINT(1) NOT NULL DEFAULT 1,
        can_edit TINYINT(1) NOT NULL DEFAULT 0,
        can_delete TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY uk_role_module_field (role, module_name, field_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    _rpTableFixed = true;
  }
}

export async function listRolePermissionsRepository(): Promise<RolePermissionRow[]> {
  await ensureRolePermissionsTable();
  return await query<RolePermissionRow>(
    `SELECT id, role, module_name, field_name, can_view, can_edit, can_delete FROM role_permissions`
  );
}

export async function saveRolePermissionsBatch(
  role: string,
  items: { module_name: string; field_name: string; can_view: boolean; can_edit: boolean; can_delete: boolean }[]
): Promise<number> {
  await ensureRolePermissionsTable();
  let saved = 0;
  for (const item of items) {
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM role_permissions WHERE role = ? AND module_name = ? AND field_name = ?`,
      [role, item.module_name, item.field_name]
    );
    if (existing) {
      await execute(
        `UPDATE role_permissions SET can_view = ?, can_edit = ?, can_delete = ? WHERE id = ?`,
        [item.can_view ? 1 : 0, item.can_edit ? 1 : 0, item.can_delete ? 1 : 0, existing.id]
      );
    } else {
      const id = (await import('crypto')).randomUUID();
      const permKey = `${item.module_name}.${item.field_name}`.slice(0, 255);
      await execute(
        `INSERT INTO role_permissions (id, role, permission, module_name, field_name, can_view, can_edit, can_delete)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, role, permKey, item.module_name, item.field_name,
         item.can_view ? 1 : 0, item.can_edit ? 1 : 0, item.can_delete ? 1 : 0]
      );
    }
    saved++;
  }
  return saved;
}
