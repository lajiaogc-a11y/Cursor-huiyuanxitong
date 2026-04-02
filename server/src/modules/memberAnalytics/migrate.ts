/**
 * 网站数据统计、登录日志、数据清理规则（启动时幂等）
 */
import { execute, query } from '../../database/index.js';

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await query<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return (rows[0]?.cnt ?? 0) > 0;
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await query<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return (rows[0]?.cnt ?? 0) > 0;
}

export async function migrateMemberAnalytics(): Promise<void> {
  if (!(await columnExists('members', 'last_login_at'))) {
    await execute(`ALTER TABLE members ADD COLUMN last_login_at DATETIME(3) NULL AFTER updated_at`);
    console.log('[member_analytics] members.last_login_at added');
  }
  if (!(await columnExists('members', 'last_seen_at'))) {
    await execute(`ALTER TABLE members ADD COLUMN last_seen_at DATETIME(3) NULL COMMENT '会员端活跃心跳，用于在线人数' AFTER last_login_at`);
    console.log('[member_analytics] members.last_seen_at added');
  }

  if (!(await columnExists('members', 'referral_source'))) {
    await execute(
      `ALTER TABLE members ADD COLUMN referral_source VARCHAR(32) NULL COMMENT 'link | manual'`,
    );
    console.log('[member_analytics] members.referral_source added (stats / cleanup invite filter)');
  }

  if (!(await tableExists('member_login_logs'))) {
    await execute(`
      CREATE TABLE member_login_logs (
        id CHAR(36) NOT NULL PRIMARY KEY,
        tenant_id CHAR(36) NULL,
        member_id CHAR(36) NOT NULL,
        login_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        KEY idx_mll_member_time (member_id, login_at),
        KEY idx_mll_tenant_time (tenant_id, login_at),
        CONSTRAINT fk_mll_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[member_analytics] member_login_logs created');
  }

  const cleanupCols: Array<{ name: string; ddl: string }> = [
    {
      name: 'data_cleanup_enabled',
      ddl: `ALTER TABLE member_portal_settings ADD COLUMN data_cleanup_enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否启用自动清理（邀请注册会员）'`,
    },
    {
      name: 'data_cleanup_no_trade_months',
      ddl: `ALTER TABLE member_portal_settings ADD COLUMN data_cleanup_no_trade_months INT NULL COMMENT '连续多少个月无有效订单'`,
    },
    {
      name: 'data_cleanup_no_login_months',
      ddl: `ALTER TABLE member_portal_settings ADD COLUMN data_cleanup_no_login_months INT NULL COMMENT '连续多少个月无登录'`,
    },
    {
      name: 'data_cleanup_max_points',
      ddl: `ALTER TABLE member_portal_settings ADD COLUMN data_cleanup_max_points DECIMAL(18,2) NULL COMMENT '积分低于该值（不含）且满足闲置条件时清理'`,
    },
  ];
  for (const c of cleanupCols) {
    if (!(await columnExists('member_portal_settings', c.name))) {
      await execute(c.ddl);
      console.log(`[member_analytics] member_portal_settings.${c.name} added`);
    }
  }
}
