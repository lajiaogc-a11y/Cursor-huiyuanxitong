/**
 * 启动时按注册表向 role_permissions 补全缺失行（去重插入，不覆盖已有配置）
 * 键列表与前端 src/lib/dataFieldPermissionModules.ts 同步，见 permissionSyncKeys.json
 */
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { execute, queryOne } from '../database/index.js';
import { logger } from '../lib/logger.js';
import { listRolePermissionsRepository } from '../modules/data/rolePermissionsRepository.js';

const ROLES = ['staff', 'manager', 'admin', 'super_admin'] as const;

function defaultsForNewRow(role: string, moduleName: string, fieldName: string): { cv: boolean; ce: boolean; cd: boolean } {
  const isBatch =
    (moduleName === 'orders' && (fieldName === 'batch_delete' || fieldName === 'batch_process')) ||
    (moduleName === 'data_management' && (fieldName === 'batch_delete' || fieldName === 'batch_action')) ||
    (moduleName === 'error_reports' && fieldName === 'batch_clear');
  if (isBatch) {
    return { cv: false, ce: false, cd: false };
  }
  if (role === 'admin' || role === 'super_admin') return { cv: true, ce: true, cd: true };
  if (role === 'manager') return { cv: true, ce: true, cd: false };
  return { cv: true, ce: false, cd: false };
}

function loadSyncKeys(): { module_name: string; field_name: string }[] {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const jsonPath = path.join(__dirname, 'permissionSyncKeys.json');
  const raw = readFileSync(jsonPath, 'utf8');
  return JSON.parse(raw) as { module_name: string; field_name: string }[];
}

export async function syncPermissionDefinitionsFromRegistry(): Promise<void> {
  await listRolePermissionsRepository();
  let keys: { module_name: string; field_name: string }[];
  try {
    keys = loadSyncKeys();
  } catch (e) {
    logger.warn('permissions', 'syncPermissionDefinitions: could not read permissionSyncKeys.json', e);
    return;
  }
  let inserted = 0;
  for (const role of ROLES) {
    for (const { module_name, field_name } of keys) {
      const ex = await queryOne<{ id: string }>(
        'SELECT id FROM role_permissions WHERE role = ? AND module_name = ? AND field_name = ?',
        [role, module_name, field_name],
      );
      if (ex) continue;
      const d = defaultsForNewRow(role, module_name, field_name);
      const id = randomUUID();
      const permKey = `${module_name}.${field_name}`.slice(0, 255);
      await execute(
        `INSERT INTO role_permissions (id, role, permission, module_name, field_name, can_view, can_edit, can_delete)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, role, permKey, module_name, field_name, d.cv ? 1 : 0, d.ce ? 1 : 0, d.cd ? 1 : 0],
      );
      inserted++;
    }
  }
  if (inserted > 0) {
    logger.info('permissions', `syncPermissionDefinitions: inserted ${inserted} missing role_permissions rows`);
  }
}
