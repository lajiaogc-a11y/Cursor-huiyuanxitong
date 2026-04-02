/**
 * api_keys + webhooks 表 schema 确保（不存在则创建，已存在则补列）
 */
import { execute, queryOne } from '../../database/index.js';

async function tableExists(tableName: string): Promise<boolean> {
  const r = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName],
  );
  return Number(r?.c) > 0;
}

async function columnExists(tableName: string, colName: string): Promise<boolean> {
  const r = await queryOne<{ c: number }>(
    `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [tableName, colName],
  );
  return Number(r?.c) > 0;
}

async function addColumnIfMissing(tableName: string, colName: string, colDef: string): Promise<void> {
  if (await columnExists(tableName, colName)) return;
  await execute(`ALTER TABLE \`${tableName}\` ADD COLUMN \`${colName}\` ${colDef}`);
}

/** 旧库可能残留明文列 api_key（NOT NULL 无默认）；当前仅使用 key_hash / key_prefix 存储 */
async function relaxLegacyApiKeyPlainColumn(): Promise<void> {
  if (!(await tableExists('api_keys'))) return;
  if (!(await columnExists('api_keys', 'api_key'))) return;
  const col = await queryOne<{ COLUMN_TYPE: string }>(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'api_keys' AND COLUMN_NAME = 'api_key' LIMIT 1`,
  );
  if (!col?.COLUMN_TYPE) return;
  await execute(`ALTER TABLE \`api_keys\` MODIFY COLUMN \`api_key\` ${col.COLUMN_TYPE} NULL`);
}

export async function ensureApiKeysTable(): Promise<void> {
  if (!(await tableExists('api_keys'))) {
    await execute(`
      CREATE TABLE api_keys (
        id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
        tenant_id CHAR(36) NULL,
        name VARCHAR(255) NULL,
        key_hash VARCHAR(255) NULL,
        key_prefix VARCHAR(50) NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        permissions JSON NULL,
        ip_whitelist JSON NULL,
        rate_limit INT NOT NULL DEFAULT 60,
        expires_at DATETIME(3) NULL,
        last_used_at DATETIME(3) NULL,
        total_requests INT NOT NULL DEFAULT 0,
        created_by CHAR(36) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        remark TEXT NULL,
        KEY idx_api_keys_tenant (tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    return;
  }

  await addColumnIfMissing('api_keys', 'tenant_id', "CHAR(36) NULL");
  await addColumnIfMissing('api_keys', 'name', "VARCHAR(255) NULL");
  await addColumnIfMissing('api_keys', 'key_hash', "VARCHAR(255) NULL");
  await addColumnIfMissing('api_keys', 'key_prefix', "VARCHAR(50) NULL");
  await addColumnIfMissing('api_keys', 'status', "VARCHAR(20) NOT NULL DEFAULT 'active'");
  await addColumnIfMissing('api_keys', 'permissions', "JSON NULL");
  await addColumnIfMissing('api_keys', 'ip_whitelist', "JSON NULL");
  await addColumnIfMissing('api_keys', 'rate_limit', "INT NOT NULL DEFAULT 60");
  await addColumnIfMissing('api_keys', 'expires_at', "DATETIME(3) NULL");
  await addColumnIfMissing('api_keys', 'last_used_at', "DATETIME(3) NULL");
  await addColumnIfMissing('api_keys', 'total_requests', "INT NOT NULL DEFAULT 0");
  await addColumnIfMissing('api_keys', 'created_by', "CHAR(36) NULL");
  await addColumnIfMissing('api_keys', 'created_at', "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)");
  await addColumnIfMissing('api_keys', 'updated_at', "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)");
  await addColumnIfMissing('api_keys', 'remark', "TEXT NULL");

  await relaxLegacyApiKeyPlainColumn();
}

export async function ensureWebhooksTable(): Promise<void> {
  if (!(await tableExists('webhooks'))) {
    await execute(`
      CREATE TABLE webhooks (
        id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
        tenant_id CHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        url TEXT NOT NULL,
        secret VARCHAR(255) NULL,
        events JSON NOT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        headers JSON NULL,
        retry_count INT NOT NULL DEFAULT 3,
        timeout_ms INT NOT NULL DEFAULT 5000,
        remark TEXT NULL,
        last_triggered_at DATETIME(3) NULL,
        total_deliveries INT NOT NULL DEFAULT 0,
        successful_deliveries INT NOT NULL DEFAULT 0,
        failed_deliveries INT NOT NULL DEFAULT 0,
        created_by CHAR(36) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        KEY idx_webhooks_tenant (tenant_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    return;
  }

  await addColumnIfMissing('webhooks', 'headers', "JSON NULL");
  await addColumnIfMissing('webhooks', 'retry_count', "INT NOT NULL DEFAULT 3");
  await addColumnIfMissing('webhooks', 'timeout_ms', "INT NOT NULL DEFAULT 5000");
  await addColumnIfMissing('webhooks', 'remark', "TEXT NULL");
  await addColumnIfMissing('webhooks', 'last_triggered_at', "DATETIME(3) NULL");
  await addColumnIfMissing('webhooks', 'total_deliveries', "INT NOT NULL DEFAULT 0");
  await addColumnIfMissing('webhooks', 'successful_deliveries', "INT NOT NULL DEFAULT 0");
  await addColumnIfMissing('webhooks', 'failed_deliveries', "INT NOT NULL DEFAULT 0");
}

export async function ensureApiRequestLogsTable(): Promise<void> {
  if (await tableExists('api_request_logs')) return;
  await execute(`
    CREATE TABLE api_request_logs (
      id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
      api_key_id CHAR(36) NULL,
      key_prefix VARCHAR(50) NULL,
      endpoint VARCHAR(500) NOT NULL,
      method VARCHAR(10) NOT NULL DEFAULT 'GET',
      ip_address VARCHAR(45) NULL,
      user_agent TEXT NULL,
      request_params JSON NULL,
      response_status INT NOT NULL DEFAULT 200,
      response_time_ms INT NULL,
      error_message TEXT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY idx_logs_api_key (api_key_id),
      KEY idx_logs_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

export async function ensureWebhookDeliveryLogsTable(): Promise<void> {
  if (await tableExists('webhook_delivery_logs')) return;
  await execute(`
    CREATE TABLE webhook_delivery_logs (
      id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
      webhook_id CHAR(36) NULL,
      event_type VARCHAR(100) NOT NULL,
      payload JSON NOT NULL,
      response_status INT NULL,
      response_body TEXT NULL,
      response_time_ms INT NULL,
      attempt INT NOT NULL DEFAULT 1,
      success TINYINT(1) NOT NULL DEFAULT 0,
      error_message TEXT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY idx_delivery_webhook (webhook_id),
      KEY idx_delivery_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}
