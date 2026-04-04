/**
 * Consolidated schema patches — all one-off fix scripts merged into a single
 * idempotent migration function.  Every operation uses IF NOT EXISTS or checks
 * information_schema so it is safe to run repeatedly.
 *
 * Replaces the following standalone scripts (now deleted):
 *   server/_patch_invite_token.mjs
 *   server/fix_schema.mjs
 *   mysql/fix_schema.mjs
 *   mysql/fix_columns.sql
 *   server/scripts/fix-all.cjs
 *   server/scripts/fix-tables.cjs
 *   server/scripts/fix-final.cjs
 *   server/scripts/fix-uds.cjs
 *   server/scripts/batch-fix.mjs
 *   server/scripts/run-fix-columns-sql.mjs
 */

import { execute, query } from '../database/index.js';
import { repairKnowledgeFields } from '../modules/data/knowledgeRepair.js';

async function colExists(table: string, col: string): Promise<boolean> {
  const rows = await query<{ c: number }>(
    `SELECT 1 AS c FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    [table, col],
  );
  return rows.length > 0;
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await query<{ c: number }>(
    `SELECT 1 AS c FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
    [table],
  );
  return rows.length > 0;
}

async function addCol(table: string, col: string, def: string): Promise<void> {
  if (await colExists(table, col)) return;
  try {
    await execute(`ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` ${def}`);
  } catch (e: unknown) {
    const msg = (e as Error).message || '';
    if (!msg.includes('Duplicate column')) {
      console.warn(`[schema-patch] addCol ${table}.${col}:`, msg.slice(0, 120));
    }
  }
}

async function createTbl(name: string, sql: string): Promise<void> {
  if (await tableExists(name)) return;
  try {
    await execute(sql);
    console.log(`[schema-patch] + TABLE ${name}`);
  } catch (e: unknown) {
    const msg = (e as Error).message || '';
    if (!msg.includes('already exists')) {
      console.warn(`[schema-patch] createTbl ${name}:`, msg.slice(0, 120));
    }
  }
}

async function safeIndex(sql: string): Promise<void> {
  try { await execute(sql); } catch { /* index may already exist */ }
}

// ---------------------------------------------------------------------------

export async function migrateSchemaPatches(): Promise<void> {
  console.log('[schema-patch] running consolidated schema patches …');

  // ── members ──
  await addCol('members', 'currency_preferences', 'JSON NULL');
  await addCol('members', 'bank_card', 'JSON NULL');
  await addCol('members', 'common_cards', 'JSON NULL');
  await addCol('members', 'customer_feature', 'TEXT NULL');
  await addCol('members', 'source_id', 'VARCHAR(255) NULL');
  await addCol('members', 'creator_id', 'CHAR(36) NULL');
  await addCol('members', 'recorder_id', 'CHAR(36) NULL');
  await addCol('members', 'is_deleted', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addCol('members', 'referrer_phone', 'VARCHAR(50) NULL');
  await addCol('members', 'referrer_id', 'CHAR(36) NULL');
  await addCol('members', 'points_balance', 'DECIMAL(18,2) NOT NULL DEFAULT 0');
  await addCol('members', 'name', 'VARCHAR(255) NULL');
  await addCol('members', 'referral_code', 'VARCHAR(64) NULL');
  await addCol('members', 'referrer_bound_at', 'DATETIME(3) NULL');
  await addCol('members', 'referral_source', 'VARCHAR(32) NULL');
  await addCol('members', 'invite_token', 'VARCHAR(32) NULL');
  await addCol('members', 'member_code', 'VARCHAR(50) NULL');
  await addCol('members', 'nickname', 'VARCHAR(255) NULL');
  try {
    await execute(
      `UPDATE members SET nickname = member_code WHERE (nickname IS NULL OR TRIM(nickname) = '') AND member_code IS NOT NULL AND TRIM(member_code) <> ''`,
    );
  } catch (e: unknown) {
    console.warn('[schema-patch] members nickname backfill:', ((e as Error).message || '').slice(0, 120));
  }
  await addCol('members', 'email', 'VARCHAR(255) NULL');
  await addCol('members', 'gender', 'VARCHAR(20) NULL');
  await addCol('members', 'birthday', 'DATE NULL');
  await addCol('members', 'address', 'TEXT NULL');
  await addCol('members', 'avatar_url', 'TEXT NULL');
  await addCol('members', 'last_login_at', 'DATETIME(3) NULL');
  /** 每次会员密码登录 +1，JWT 携带 sid；新设备登录后旧 token 与库不一致即 401，实现单活跃会话 */
  await addCol('members', 'member_login_session_seq', 'BIGINT NOT NULL DEFAULT 0');
  /** 1=会员须先改密才能调用业务 API（员工创建/重置初始密码后） */
  await addCol('members', 'must_change_password', 'TINYINT(1) NOT NULL DEFAULT 0');
  /**
   * 1=已完成「首次门户改密」或曾登录门户（last_login_at 有值）已豁免。
   * 0=首次进入会员门户须改密（与 must_change_password 任一为真即拦截业务 API）。
   */
  await addCol(
    'members',
    'member_portal_first_login_done',
    'TINYINT(1) NOT NULL DEFAULT 0 COMMENT \'1=首次门户改密完成或老用户曾登录豁免\'',
  );
  try {
    await execute(`UPDATE members SET member_portal_first_login_done = 1 WHERE last_login_at IS NOT NULL`);
  } catch (e: unknown) {
    console.warn('[schema-patch] member_portal_first_login_done backfill:', ((e as Error).message || '').slice(0, 120));
  }
  await addCol('members', 'login_count', 'INT NOT NULL DEFAULT 0');
  await safeIndex('ALTER TABLE members ADD UNIQUE INDEX uk_members_invite_token (invite_token)');

  // ── employees ──
  await addCol('employees', 'visible', 'TINYINT(1) NOT NULL DEFAULT 1');
  await addCol('employees', 'real_name', 'VARCHAR(255) NULL');
  await addCol('employees', 'status', "VARCHAR(50) NOT NULL DEFAULT 'active'");
  await addCol('employees', 'last_login_at', 'DATETIME(3) NULL');
  await addCol('employees', 'login_count', 'INT NOT NULL DEFAULT 0');

  // ── orders ──
  await addCol('orders', 'phone_number', 'VARCHAR(50) NULL');
  await addCol('orders', 'actual_payment', 'DECIMAL(18,2) NULL');
  await addCol('orders', 'profit_ngn', 'DECIMAL(18,2) NULL');
  await addCol('orders', 'profit_usdt', 'DECIMAL(18,2) NULL');
  await addCol('orders', 'is_deleted', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addCol('orders', 'creator_id', 'CHAR(36) NULL');
  await addCol('orders', 'sales_user_id', 'CHAR(36) NULL');
  await addCol('orders', 'points_status', 'VARCHAR(50) NULL');
  await addCol('orders', 'order_points', 'DECIMAL(18,2) NULL');
  await addCol('orders', 'tenant_id', 'CHAR(36) NULL');
  await addCol('orders', 'member_id', 'CHAR(36) NULL');
  await addCol('orders', 'currency', "VARCHAR(10) NULL DEFAULT 'NGN'");
  await addCol('orders', 'amount', 'DECIMAL(18,2) NULL');
  await addCol('orders', 'status', "VARCHAR(50) NOT NULL DEFAULT 'pending'");
  await addCol('orders', 'card_name', 'VARCHAR(255) NULL');
  await addCol('orders', 'card_type', 'VARCHAR(100) NULL');
  await addCol('orders', 'vendor_name', 'VARCHAR(255) NULL');
  await addCol('orders', 'rate', 'DECIMAL(18,6) NULL');
  await addCol('orders', 'fee', 'DECIMAL(18,2) NULL');
  await addCol('orders', 'payment_method', 'VARCHAR(100) NULL');
  await addCol('orders', 'payment_provider', 'VARCHAR(255) NULL');
  await addCol('orders', 'remark', 'TEXT NULL');
  await addCol('orders', 'card_merchant_id', 'CHAR(36) NULL');
  await addCol('orders', 'payment_value', 'DECIMAL(18,2) NOT NULL DEFAULT 0');
  await addCol('orders', 'card_value', 'DECIMAL(18,2) NULL');
  await addCol('orders', 'completed_at', 'DATETIME(3) NULL');
  await addCol('orders', 'member_code_snapshot', 'VARCHAR(50) NULL');
  await addCol('orders', 'profit_rate', 'DECIMAL(18,6) NULL');
  await addCol('orders', 'exchange_rate', 'DECIMAL(18,6) NULL');
  await addCol('orders', 'usdt_amount', 'DECIMAL(18,6) NULL');
  await addCol('orders', 'ghs_amount', 'DECIMAL(18,2) NULL');
  await addCol('orders', 'ngn_amount', 'DECIMAL(18,2) NULL');
  await addCol('orders', 'settlement_status', "VARCHAR(50) NULL DEFAULT 'unsettled'");
  await addCol('orders', 'vendor_settlement_id', 'CHAR(36) NULL');
  await addCol('orders', 'payment_settlement_id', 'CHAR(36) NULL');
  await addCol('orders', 'order_number', 'VARCHAR(50) NULL');
  await addCol('orders', 'member_name', 'VARCHAR(255) NULL');
  await addCol('orders', 'member_code', 'VARCHAR(50) NULL');
  await addCol('orders', 'payment_status', "VARCHAR(50) NULL DEFAULT 'pending'");

  // ── gift_cards ──
  await addCol('gift_cards', 'name', 'VARCHAR(255) NULL');
  await addCol('gift_cards', 'type', 'VARCHAR(100) NULL');
  await addCol('gift_cards', 'card_vendors', 'JSON NULL');
  await addCol('gift_cards', 'sort_order', 'INT NOT NULL DEFAULT 0');
  await addCol('gift_cards', 'status', "VARCHAR(50) NOT NULL DEFAULT 'active'");
  await addCol('gift_cards', 'remark', 'TEXT NULL');
  await addCol('gift_cards', 'tenant_id', 'CHAR(36) NULL');
  await addCol('gift_cards', 'image_url', 'TEXT NULL');
  await addCol('gift_cards', 'description', 'TEXT NULL');
  await addCol('gift_cards', 'min_amount', 'DECIMAL(18,2) NULL DEFAULT 0');
  await addCol('gift_cards', 'max_amount', 'DECIMAL(18,2) NULL DEFAULT 0');
  await addCol('gift_cards', 'fee_rate', 'DECIMAL(8,4) NULL DEFAULT 0');
  await addCol('gift_cards', 'vendor_id', 'CHAR(36) NULL');
  await addCol('gift_cards', 'provider_id', 'CHAR(36) NULL');
  await addCol('gift_cards', 'currency', "VARCHAR(10) NULL DEFAULT 'NGN'");

  // ── vendors ──
  await addCol('vendors', 'name', 'VARCHAR(255) NULL');
  await addCol('vendors', 'status', "VARCHAR(50) NOT NULL DEFAULT 'active'");
  await addCol('vendors', 'remark', 'TEXT NULL');
  await addCol('vendors', 'payment_providers', 'JSON NULL');
  await addCol('vendors', 'sort_order', 'INT NOT NULL DEFAULT 0');

  // ── payment_providers ──
  await addCol('payment_providers', 'name', 'VARCHAR(255) NULL');
  await addCol('payment_providers', 'status', "VARCHAR(50) NOT NULL DEFAULT 'active'");
  await addCol('payment_providers', 'sort_order', 'INT NOT NULL DEFAULT 0');
  await addCol('payment_providers', 'remark', 'TEXT NULL');

  // ── points_ledger ──
  await addCol('points_ledger', 'order_id', 'CHAR(36) NULL');
  await addCol('points_ledger', 'creator_id', 'CHAR(36) NULL');
  await addCol('points_ledger', 'points', 'DECIMAL(18,2) NULL');
  await addCol('points_ledger', 'source', 'VARCHAR(100) NULL');
  await addCol('points_ledger', 'member_code', 'VARCHAR(50) NULL');
  await addCol('points_ledger', 'phone_number', 'VARCHAR(50) NULL');
  await addCol('points_ledger', 'transaction_type', 'VARCHAR(50) NULL');
  await addCol('points_ledger', 'actual_payment', 'DECIMAL(18,2) NULL');
  await addCol('points_ledger', 'currency', 'VARCHAR(20) NULL');
  await addCol('points_ledger', 'exchange_rate', 'DECIMAL(18,6) NULL');
  await addCol('points_ledger', 'usd_amount', 'DECIMAL(18,2) NULL');
  await addCol('points_ledger', 'points_multiplier', 'DECIMAL(10,4) NULL');
  await addCol('points_ledger', 'points_earned', 'DECIMAL(18,2) NULL');
  await addCol('points_ledger', 'status', "VARCHAR(50) NULL DEFAULT 'active'");
  await addCol('points_ledger', 'tenant_id', 'CHAR(36) NULL');

  // ── points_accounts ──
  await addCol('points_accounts', 'member_code', 'VARCHAR(50) NULL');
  await addCol('points_accounts', 'phone', 'VARCHAR(50) NULL');
  await addCol('points_accounts', 'last_reset_time', 'DATETIME(3) NULL');
  await addCol('points_accounts', 'last_updated', 'DATETIME(3) NULL');
  await addCol('points_accounts', 'tenant_id', 'CHAR(36) NULL');
  await addCol('points_accounts', 'points_accrual_start_time', 'DATETIME(3) NULL');
  await addCol('points_accounts', 'current_cycle_id', 'VARCHAR(128) NULL');

  // ── knowledge tables ──
  await addCol('knowledge_articles', 'title_zh', 'VARCHAR(500) NULL');
  await addCol('knowledge_articles', 'title_en', 'VARCHAR(500) NULL');
  await addCol('knowledge_articles', 'description', 'TEXT NULL');
  await addCol('knowledge_articles', 'image_url', 'TEXT NULL');
  await addCol('knowledge_articles', 'visibility', "VARCHAR(50) NULL DEFAULT 'public'");
  await addCol('knowledge_articles', 'created_by', 'CHAR(36) NULL');
  await addCol('knowledge_articles', 'tenant_id', 'CHAR(36) NULL');
  await addCol('knowledge_categories', 'tenant_id', 'CHAR(36) NULL');
  await addCol('knowledge_categories', 'content_type', 'VARCHAR(50) NULL');
  await addCol('knowledge_categories', 'visibility', "VARCHAR(50) NULL DEFAULT 'public'");
  await addCol('knowledge_categories', 'created_by', 'CHAR(36) NULL');
  await addCol('knowledge_categories', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1');

  // ── misc column patches ──
  await addCol('activity_types', 'value', 'VARCHAR(100) NULL');
  await addCol('activity_types', 'label', 'VARCHAR(255) NULL');
  await addCol('activity_types', 'sort_order', 'INT NOT NULL DEFAULT 0');
  await addCol('shift_handovers', 'payment_provider_data', 'JSON NULL');
  await addCol('shift_receivers', 'creator_id', 'CHAR(36) NULL');

  // ── employee_login_logs：若库中从未建表，仅 addCol 会全部失败，登录接口又因锁定检查 try/catch 跳过而仍能登录 → 日志页长期为空
  await createTbl(
    'employee_login_logs',
    `CREATE TABLE IF NOT EXISTS \`employee_login_logs\` (
      \`id\` CHAR(36) NOT NULL PRIMARY KEY,
      \`employee_id\` CHAR(36) NULL,
      \`username\` VARCHAR(255) NULL,
      \`ip_address\` VARCHAR(100) NULL,
      \`ip_location\` VARCHAR(255) NULL,
      \`user_agent\` TEXT NULL,
      \`success\` TINYINT(1) NULL DEFAULT 1,
      \`failure_reason\` TEXT NULL,
      \`created_at\` DATETIME(3) NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`login_time\` DATETIME(3) NULL,
      \`action\` VARCHAR(50) NULL DEFAULT 'login',
      KEY \`idx_employee_login_created\` (\`created_at\`),
      KEY \`idx_employee_login_username\` (\`username\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
  await addCol('employee_login_logs', 'login_time', 'DATETIME(3) NULL');
  await addCol('employee_login_logs', 'action', "VARCHAR(50) NULL DEFAULT 'login'");
  await addCol('employee_login_logs', 'username', 'VARCHAR(255) NULL');
  await addCol('employee_login_logs', 'employee_id', 'CHAR(36) NULL');
  await addCol('employee_login_logs', 'ip_address', 'VARCHAR(100) NULL');
  await addCol('employee_login_logs', 'ip_location', 'VARCHAR(255) NULL');
  await addCol('employee_login_logs', 'user_agent', 'TEXT NULL');
  await addCol('employee_login_logs', 'success', 'TINYINT(1) NULL DEFAULT 1');
  await addCol('employee_login_logs', 'failure_reason', 'TEXT NULL');
  await addCol('invitation_codes', 'tenant_id', 'CHAR(36) NULL');
  await addCol('invitation_codes', 'status', "VARCHAR(50) NOT NULL DEFAULT 'active'");
  await addCol('invitation_codes', 'created_by', 'CHAR(36) NULL');
  await addCol('notifications', 'category', "VARCHAR(100) NULL DEFAULT 'system'");
  await addCol('notifications', 'metadata', 'JSON NULL');
  await addCol('referral_relations', 'referrer_phone', 'VARCHAR(50) NULL');
  await addCol('referral_relations', 'referrer_member_code', 'VARCHAR(50) NULL');
  await addCol('referral_relations', 'referee_phone', 'VARCHAR(50) NULL');
  await addCol('referral_relations', 'referee_member_code', 'VARCHAR(50) NULL');
  await addCol('referral_relations', 'source', "VARCHAR(255) NULL DEFAULT '转介绍'");
  try { await execute('ALTER TABLE referral_relations MODIFY COLUMN referrer_id CHAR(36) NULL'); } catch { /* already nullable */ }
  try { await execute('ALTER TABLE referral_relations MODIFY COLUMN referee_id CHAR(36) NULL'); } catch { /* already nullable */ }
  try { await execute('ALTER TABLE referral_relations DROP FOREIGN KEY fk_referral_referrer'); } catch { /* already dropped or doesn't exist */ }
  try { await execute('ALTER TABLE referral_relations DROP FOREIGN KEY fk_referral_referee'); } catch { /* already dropped or doesn't exist */ }
  await addCol('role_permissions', 'module_name', 'VARCHAR(100) NULL');
  await addCol('role_permissions', 'field_name', 'VARCHAR(100) NULL');
  await addCol('role_permissions', 'can_view', 'TINYINT(1) NOT NULL DEFAULT 1');
  await addCol('role_permissions', 'can_edit', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addCol('role_permissions', 'can_delete', 'TINYINT(1) NOT NULL DEFAULT 0');
  await addCol('shared_data_store', 'data_key', 'VARCHAR(255) NULL');
  await addCol('shared_data_store', 'data_value', 'JSON NULL');
  await addCol('shared_data_store', 'tenant_id', 'CHAR(36) NULL');
  await addCol('audit_records', 'tenant_id', 'CHAR(36) NULL');
  await addCol('audit_records', 'operator_id', 'CHAR(36) NULL');
  await addCol('audit_records', 'status', "VARCHAR(50) NULL DEFAULT 'pending'");
  await addCol('activity_gifts', 'tenant_id', 'CHAR(36) NULL');
  await addCol('activity_gifts', 'status', "VARCHAR(50) NULL DEFAULT 'active'");
  await addCol('member_portal_settings', 'invite_link_prefix', 'TEXT NULL');
  await addCol('member_portal_settings', 'home_points_balance_hint_zh', 'TEXT NULL');
  await addCol('member_portal_settings', 'home_points_balance_hint_en', 'TEXT NULL');
  /** 公告弹窗频率（runOnce 的 migrateMemberPortalSettingsColumns 已执行过的库不会重跑，故在此幂等补齐） */
  await addCol(
    'member_portal_settings',
    'announcement_popup_frequency',
    "VARCHAR(24) NULL COMMENT '公告弹窗频率 off|every_login|daily_first'",
  );
  await addCol('member_portal_settings', 'points_mall_balance_hint_zh', 'TEXT NULL');
  await addCol('member_portal_settings', 'points_mall_balance_hint_en', 'TEXT NULL');
  await addCol('member_portal_settings', 'points_mall_redeem_rules_title_zh', 'TEXT NULL');
  await addCol('member_portal_settings', 'points_mall_redeem_rules_title_en', 'TEXT NULL');
  await addCol('member_portal_settings', 'points_mall_redeem_daily_unlimited_zh', 'TEXT NULL');
  await addCol('member_portal_settings', 'points_mall_redeem_daily_unlimited_en', 'TEXT NULL');
  await addCol('member_portal_settings', 'points_mall_redeem_lifetime_unlimited_zh', 'TEXT NULL');
  await addCol('member_portal_settings', 'points_mall_redeem_lifetime_unlimited_en', 'TEXT NULL');
  await addCol('member_portal_settings', 'login_carousel_slides', 'JSON NULL COMMENT \'登录页顶栏轮播(JSON数组)\'');
  await addCol('member_portal_settings', 'login_carousel_interval_sec', 'INT NOT NULL DEFAULT 5 COMMENT \'登录轮播自动切换间隔(秒)\'');
  await addCol(
    'member_portal_settings',
    'home_banners_carousel_interval_sec',
    'INT NOT NULL DEFAULT 5 COMMENT \'首页轮播自动切换间隔(秒) 3-60\'',
  );
  await addCol('member_portal_settings', 'terms_of_service_zh', 'MEDIUMTEXT NULL COMMENT \'服务条款(中文)\'');
  await addCol('member_portal_settings', 'terms_of_service_en', 'MEDIUMTEXT NULL COMMENT \'服务条款(英文)\'');
  await addCol('member_portal_settings', 'privacy_policy_zh', 'MEDIUMTEXT NULL COMMENT \'隐私政策(中文)\'');
  await addCol('member_portal_settings', 'privacy_policy_en', 'MEDIUMTEXT NULL COMMENT \'隐私政策(英文)\'');
  await addCol(
    'member_portal_settings',
    'registration_require_legal_agreement',
    'TINYINT(1) NOT NULL DEFAULT 1 COMMENT \'注册是否须勾选同意条款\'',
  );
  await addCol(
    'member_portal_settings',
    'home_first_trade_contact_zh',
    'TEXT NULL COMMENT \'首页首笔交易联系客服说明(中文)\'',
  );
  await addCol(
    'member_portal_settings',
    'home_first_trade_contact_en',
    'TEXT NULL COMMENT \'首页首笔交易联系客服说明(英文)\'',
  );
  await addCol(
    'member_portal_settings',
    'enable_member_inbox',
    'TINYINT(1) NOT NULL DEFAULT 1 COMMENT \'会员端收件箱总开关\'',
  );
  await addCol(
    'member_portal_settings',
    'member_inbox_notify_order_spin',
    'TINYINT(1) NOT NULL DEFAULT 1 COMMENT \'交易完成转盘奖励通知\'',
  );
  await addCol(
    'member_portal_settings',
    'member_inbox_notify_mall_redemption',
    'TINYINT(1) NOT NULL DEFAULT 1 COMMENT \'积分商城兑换结果通知\'',
  );
  await addCol(
    'member_portal_settings',
    'member_inbox_notify_announcement',
    'TINYINT(1) NOT NULL DEFAULT 1 COMMENT \'门户公告同步至收件箱\'',
  );
  await addCol(
    'member_portal_settings',
    'member_inbox_copy_templates',
    'JSON NULL COMMENT \'会员收件箱通知文案模板(占位符)\'',
  );

  // ── phone_pool / phone_reservations columns ──
  if (await tableExists('phone_pool')) {
    await addCol('phone_pool', 'normalized', 'VARCHAR(50) NULL');
    await addCol('phone_pool', 'reserved_by', 'CHAR(36) NULL');
    await addCol('phone_pool', 'reserved_at', 'DATETIME(3) NULL');
    await addCol('phone_pool', 'consumed_at', 'DATETIME(3) NULL');
    await addCol('phone_pool', 'consumed_by', 'CHAR(36) NULL');
    await addCol('phone_pool', 'source', 'VARCHAR(100) NULL');
    await addCol('phone_pool', 'batch_id', 'VARCHAR(100) NULL');
    await safeIndex('CREATE INDEX idx_phone_pool_normalized ON phone_pool(normalized)');
    await safeIndex('CREATE INDEX idx_phone_pool_reserved_by ON phone_pool(reserved_by)');
    try { await execute('ALTER TABLE phone_pool MODIFY COLUMN reserved_by CHAR(36) NULL'); } catch { /* already nullable */ }
  }
  if (await tableExists('phone_reservations')) {
    await addCol('phone_reservations', 'action', "VARCHAR(50) NULL DEFAULT 'extract'");
    await addCol('phone_reservations', 'action_at', 'DATETIME(3) NULL');
    await addCol('phone_reservations', 'user_id', 'CHAR(36) NULL');
    await addCol('phone_reservations', 'username', 'VARCHAR(255) NULL');
    try { await execute('ALTER TABLE phone_reservations MODIFY COLUMN reserved_by CHAR(36) NULL'); } catch { /* already nullable */ }
  }

  // ── user_data_store ──
  if (await tableExists('user_data_store')) {
    await addCol('user_data_store', 'user_id', 'CHAR(36) NULL');
    await addCol('user_data_store', 'data_key', 'VARCHAR(255) NULL');
    await addCol('user_data_store', 'data_value', 'JSON NULL');
    await addCol('user_data_store', 'tenant_id', 'CHAR(36) NULL');
    await safeIndex('CREATE INDEX idx_user_data_store_user ON user_data_store(user_id)');
    await safeIndex('CREATE INDEX idx_user_data_store_key ON user_data_store(data_key)');
  }

  // ── announcements ──
  if (await tableExists('announcements')) {
    await addCol('announcements', 'title', 'VARCHAR(500) NULL');
    await addCol('announcements', 'content', 'TEXT NULL');
    await addCol('announcements', 'type', "VARCHAR(50) NULL DEFAULT 'info'");
    await addCol('announcements', 'is_active', 'TINYINT(1) NOT NULL DEFAULT 1');
    await addCol('announcements', 'tenant_id', 'CHAR(36) NULL');
    await addCol('announcements', 'created_by', 'CHAR(36) NULL');
    await addCol('announcements', 'priority', 'INT NOT NULL DEFAULT 0');
    await addCol('announcements', 'start_at', 'DATETIME(3) NULL');
    await addCol('announcements', 'end_at', 'DATETIME(3) NULL');
  }

  // ══════════════ CREATE TABLES ══════════════

  await createTbl('notifications', `CREATE TABLE notifications (
    id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    tenant_id CHAR(36) NULL, user_id CHAR(36) NULL,
    title VARCHAR(500) NULL, content TEXT NULL,
    type VARCHAR(50) NULL DEFAULT 'info', category VARCHAR(100) NULL DEFAULT 'system',
    metadata JSON NULL, is_read TINYINT(1) NOT NULL DEFAULT 0, link VARCHAR(500) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX idx_notif_user (user_id), INDEX idx_notif_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await createTbl('system_logs', `CREATE TABLE system_logs (
    id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    level VARCHAR(20) NULL DEFAULT 'info', module VARCHAR(100) NULL,
    message TEXT NULL, details JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await createTbl('user_preferences', `CREATE TABLE user_preferences (
    id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    user_id CHAR(36) NOT NULL, preference_key VARCHAR(255) NOT NULL,
    preference_value JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_user_pref (user_id, preference_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await createTbl('member_operation_logs', `CREATE TABLE member_operation_logs (
    id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    member_id CHAR(36) NOT NULL, tenant_id CHAR(36) NULL,
    action VARCHAR(100) NOT NULL, detail TEXT NULL,
    ip_address VARCHAR(50) NULL, user_agent TEXT NULL,
    created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_mol_member (member_id), KEY idx_mol_tenant (tenant_id),
    KEY idx_mol_action (action), KEY idx_mol_created (created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await createTbl('member_activity', `CREATE TABLE member_activity (
    id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    member_id CHAR(36) NOT NULL, phone_number VARCHAR(50) NULL,
    order_count INT NOT NULL DEFAULT 0, remaining_points DECIMAL(18,2) NOT NULL DEFAULT 0,
    accumulated_profit DECIMAL(18,2) NOT NULL DEFAULT 0, accumulated_profit_usdt DECIMAL(18,2) NOT NULL DEFAULT 0,
    total_accumulated_ngn DECIMAL(18,2) NOT NULL DEFAULT 0, total_accumulated_ghs DECIMAL(18,2) NOT NULL DEFAULT 0,
    total_accumulated_usdt DECIMAL(18,2) NOT NULL DEFAULT 0, referral_count INT NOT NULL DEFAULT 0,
    accumulated_points DECIMAL(18,2) NOT NULL DEFAULT 0, referral_points DECIMAL(18,2) NOT NULL DEFAULT 0,
    total_gift_ngn DECIMAL(18,2) NOT NULL DEFAULT 0, total_gift_ghs DECIMAL(18,2) NOT NULL DEFAULT 0,
    total_gift_usdt DECIMAL(18,2) NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_ma_member (member_id), INDEX idx_ma_phone (phone_number)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await createTbl('operation_logs', `CREATE TABLE operation_logs (
    id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    operator_id CHAR(36) NULL, operator_account VARCHAR(255) NULL, operator_role VARCHAR(50) NULL,
    module VARCHAR(100) NULL, operation_type VARCHAR(100) NULL, object_id VARCHAR(255) NULL,
    object_description TEXT NULL, before_data JSON NULL, after_data JSON NULL, ip_address VARCHAR(100) NULL,
    timestamp DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    is_restored TINYINT(1) NOT NULL DEFAULT 0, restored_by CHAR(36) NULL, restored_at DATETIME(3) NULL,
    INDEX idx_ol_op (operator_id), INDEX idx_ol_mod (module), INDEX idx_ol_ts (timestamp)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await createTbl('spin_quotas', `CREATE TABLE spin_quotas (
    id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    member_id CHAR(36) NOT NULL, quota INT NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    INDEX idx_sq_member (member_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await createTbl('employee_name_history', `CREATE TABLE employee_name_history (
    id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    employee_id CHAR(36) NOT NULL, old_name VARCHAR(255) NULL, new_name VARCHAR(255) NULL,
    changed_by CHAR(36) NULL, changed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), reason TEXT NULL,
    INDEX idx_enh_emp (employee_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await createTbl('knowledge_read_status', `CREATE TABLE knowledge_read_status (
    id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    employee_id CHAR(36) NOT NULL, article_id CHAR(36) NOT NULL,
    read_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE KEY uk_rs (employee_id, article_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await createTbl('currencies', `CREATE TABLE currencies (
    id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    code VARCHAR(20) NOT NULL UNIQUE, name_zh VARCHAR(100) NULL, name_en VARCHAR(100) NULL,
    symbol VARCHAR(10) NULL, badge_color VARCHAR(50) NULL, sort_order INT NOT NULL DEFAULT 0,
    is_active TINYINT(1) NOT NULL DEFAULT 1, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await createTbl('customer_sources', `CREATE TABLE customer_sources (
    id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    name VARCHAR(255) NOT NULL, sort_order INT NOT NULL DEFAULT 0, is_active TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await createTbl('data_settings', `CREATE TABLE data_settings (
    id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    setting_key VARCHAR(255) NOT NULL UNIQUE, setting_value JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await createTbl('ledger_transactions', `CREATE TABLE ledger_transactions (
    id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    account_id VARCHAR(255) NULL, account_type VARCHAR(50) NULL, operator_id CHAR(36) NULL,
    amount DECIMAL(18,2) NULL, balance_after DECIMAL(18,2) NULL, description TEXT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    tenant_id CHAR(36) NULL, source_type VARCHAR(80) NULL, source_id VARCHAR(255) NULL,
    before_balance DECIMAL(18,2) NULL, is_active TINYINT(1) NOT NULL DEFAULT 1,
    reversal_of CHAR(36) NULL, note TEXT NULL, operator_name VARCHAR(255) NULL,
    batch_id VARCHAR(64) NULL, KEY idx_ledger_batch_id (batch_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await createTbl('balance_change_logs', `CREATE TABLE balance_change_logs (
    id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    merchant_name VARCHAR(255) NULL, merchant_type VARCHAR(100) NULL, operator_id CHAR(36) NULL,
    amount DECIMAL(18,2) NULL, balance_before DECIMAL(18,2) NULL, balance_after DECIMAL(18,2) NULL,
    description TEXT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await createTbl('risk_events', `CREATE TABLE risk_events (
    id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    employee_id CHAR(36) NULL, event_type VARCHAR(100) NULL, severity VARCHAR(50) NULL,
    description TEXT NULL, resolved TINYINT(1) NOT NULL DEFAULT 0, resolved_by CHAR(36) NULL,
    resolved_at DATETIME(3) NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await createTbl('permission_change_logs', `CREATE TABLE permission_change_logs (
    id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    role VARCHAR(50) NULL, changed_by CHAR(36) NULL, changes JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await createTbl('permission_versions', `CREATE TABLE permission_versions (
    id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    version_no INT NOT NULL, snapshot JSON NULL, created_by CHAR(36) NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await createTbl('vendor_settlements', `CREATE TABLE vendor_settlements (
    id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    tenant_id CHAR(36) NULL, vendor_id CHAR(36) NULL, vendor_name VARCHAR(255) NULL,
    period_start DATE NULL, period_end DATE NULL,
    total_orders INT NOT NULL DEFAULT 0, total_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    total_fee DECIMAL(18,2) NOT NULL DEFAULT 0, net_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    status VARCHAR(50) NULL DEFAULT 'pending', settled_at DATETIME(3) NULL, settled_by CHAR(36) NULL,
    notes TEXT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    is_deleted TINYINT(1) NOT NULL DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await createTbl('payment_settlements', `CREATE TABLE payment_settlements (
    id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    tenant_id CHAR(36) NULL, provider_id CHAR(36) NULL, provider_name VARCHAR(255) NULL,
    period_start DATE NULL, period_end DATE NULL,
    total_orders INT NOT NULL DEFAULT 0, total_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    total_fee DECIMAL(18,2) NOT NULL DEFAULT 0, net_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    status VARCHAR(50) NULL DEFAULT 'pending', settled_at DATETIME(3) NULL, settled_by CHAR(36) NULL,
    notes TEXT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    is_deleted TINYINT(1) NOT NULL DEFAULT 0
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await createTbl('employee_permissions', `CREATE TABLE employee_permissions (
    id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    employee_id CHAR(36) NULL, permission_key VARCHAR(255) NOT NULL,
    can_edit_directly TINYINT(1) NOT NULL DEFAULT 0, requires_approval TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    KEY idx_ep_employee_id (employee_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await createTbl('card_types', `CREATE TABLE card_types (
    id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    name VARCHAR(255) NOT NULL, sort_order INT NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  await createTbl('extract_settings', `CREATE TABLE extract_settings (
    id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
    tenant_id CHAR(36) NULL, setting_key VARCHAR(255) NOT NULL,
    setting_value JSON NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

  // ── api_request_logs ──
  // 旧版本使用 path/status_code，新版本期望 endpoint/response_status
  // 通过 addCol 添加缺失列，兼容已存在的旧版本表
  await addCol('api_request_logs', 'endpoint', 'VARCHAR(500) NULL');
  await addCol('api_request_logs', 'response_status', 'INT NULL');
  await addCol('api_request_logs', 'key_prefix', 'VARCHAR(50) NULL');
  await addCol('api_request_logs', 'request_params', 'JSON NULL');
  // 将旧版 path 数据同步到 endpoint（仅当 endpoint 为空时），保持查询兼容性
  try {
    const hasPath = await colExists('api_request_logs', 'path');
    if (hasPath) {
      await execute(`UPDATE api_request_logs SET endpoint = path WHERE endpoint IS NULL AND path IS NOT NULL`);
      await execute(`UPDATE api_request_logs SET response_status = status_code WHERE response_status IS NULL AND status_code IS NOT NULL`);
    }
  } catch { /* 同步失败不影响启动 */ }

  // ── cards view (legacy alias for gift_cards) ──
  try {
    await execute('CREATE OR REPLACE VIEW cards AS SELECT * FROM gift_cards');
  } catch { /* may already exist as table */ }

  // ── 公司文档 knowledge_*：旧版 visibility 默认 `all`，与列表 API（只认 public/private）不一致，会导致分类/文章「消失」
  try {
    await repairKnowledgeFields();
  } catch { /* ignore */ }

  // ── points_accounts: frozen_points for redemption freeze mechanism ──
  await addCol('points_accounts', 'frozen_points', 'DECIMAL(18,2) NOT NULL DEFAULT 0');

  // ── point_orders: 积分兑换订单（冻结→审核→确认/拒绝/回滚） ──
  await createTbl('point_orders', `
    CREATE TABLE point_orders (
      id VARCHAR(20) NOT NULL PRIMARY KEY,
      member_id CHAR(36) NOT NULL,
      tenant_id CHAR(36) NULL,
      phone VARCHAR(50) NULL,
      nickname VARCHAR(255) NULL,
      product_name VARCHAR(255) NOT NULL,
      product_id CHAR(36) NULL,
      quantity INT NOT NULL DEFAULT 1,
      points_cost DECIMAL(18,2) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending' COMMENT 'pending | success | rejected',
      client_request_id VARCHAR(64) NULL,
      reject_reason TEXT NULL,
      reviewed_by CHAR(36) NULL,
      reviewed_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      KEY idx_point_orders_member (member_id),
      KEY idx_point_orders_tenant (tenant_id),
      KEY idx_point_orders_status (status),
      UNIQUE KEY uk_point_orders_client_req (client_request_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ── redemptions: 积分商城兑换幂等键（member_redeem_points_mall_item，与 tableProxy INSERT/WHERE 一致） ──
  if (await tableExists('redemptions')) {
    await addCol('redemptions', 'client_request_id', "VARCHAR(64) NULL COMMENT '会员端幂等键'");
    await safeIndex(
      'CREATE UNIQUE INDEX uk_redemptions_member_client_req ON redemptions (member_id, client_request_id)',
    );
    // 旧表 type NOT NULL 且无 DEFAULT → 未写 type 的 INSERT 报 1364；商城 RPC 已写 type='mall'，此处为抽奖等路径补默认
    if (await colExists('redemptions', 'type')) {
      try {
        await execute(
          `ALTER TABLE redemptions MODIFY COLUMN type VARCHAR(50) NOT NULL DEFAULT 'prize'`,
        );
      } catch (e: unknown) {
        console.warn('[schema-patch] redemptions.type default:', ((e as Error).message || '').slice(0, 120));
      }
    }
    await addCol('redemptions', 'member_phone_snapshot', 'VARCHAR(64) NULL COMMENT \'下单时会员手机号快照\'');
    await addCol('redemptions', 'processed_by_employee_id', 'CHAR(36) NULL');
    await addCol('redemptions', 'processed_by_name', 'VARCHAR(255) NULL');
    try {
      await execute(`
        UPDATE redemptions r
        INNER JOIN members m ON m.id = r.member_id
        SET r.member_phone_snapshot = m.phone_number
        WHERE (r.member_phone_snapshot IS NULL OR TRIM(r.member_phone_snapshot) = '')
          AND (r.mall_item_id IS NOT NULL OR r.type = 'mall')
      `);
    } catch (e: unknown) {
      console.warn('[schema-patch] redemptions.member_phone_snapshot backfill:', ((e as Error).message || '').slice(0, 120));
    }
  }

  // ── activity_types：从 name/code 回填 label/value；删明显垃圾行；补默认活动1/活动2 ──
  if (await tableExists('activity_types')) {
    try {
      await execute(
        `UPDATE activity_types SET label = name
         WHERE (label IS NULL OR TRIM(label) = '') AND name IS NOT NULL AND TRIM(name) <> ''`,
      );
    } catch (e: unknown) {
      console.warn('[schema-patch] activity_types label backfill:', ((e as Error).message || '').slice(0, 120));
    }
    try {
      await execute(
        `UPDATE activity_types SET value = code
         WHERE (value IS NULL OR TRIM(value) = '') AND code IS NOT NULL AND TRIM(code) <> ''`,
      );
    } catch (e: unknown) {
      console.warn('[schema-patch] activity_types value backfill:', ((e as Error).message || '').slice(0, 120));
    }
    // 新增时生成的 type_时间戳 且从未填写名称的废行
    try {
      await execute(
        `DELETE FROM activity_types
         WHERE (
           (value REGEXP '^type_[0-9]{10,}$' OR code REGEXP '^type_[0-9]{10,}$')
           AND (NULLIF(TRIM(COALESCE(label, '')), '') IS NULL OR TRIM(label) IN ('e', 'E'))
           AND (NULLIF(TRIM(COALESCE(name, '')), '') IS NULL OR TRIM(name) IN ('e', 'E'))
         )`,
      );
    } catch (e: unknown) {
      console.warn('[schema-patch] activity_types junk delete:', ((e as Error).message || '').slice(0, 120));
    }
    const atDefaults: Array<[string, string, string, number]> = [
      ['activity_1', '活动1', '活动1', 1],
      ['activity_2', '活动2', '活动2', 2],
    ];
    for (const [codeVal, nameZh, labelZh, sort] of atDefaults) {
      try {
        await execute(
          `INSERT INTO activity_types (id, name, code, value, label, is_active, sort_order)
           SELECT UUID(), ?, ?, ?, ?, 1, ? FROM DUAL
           WHERE NOT EXISTS (
             SELECT 1 FROM activity_types t
             WHERE UPPER(TRIM(t.code)) = UPPER(?) OR UPPER(TRIM(COALESCE(t.value, ''))) = UPPER(?)
             LIMIT 1
           )`,
          [nameZh, codeVal, codeVal, labelZh, sort, codeVal, codeVal],
        );
      } catch (e: unknown) {
        console.warn(`[schema-patch] ensure activity_type ${codeVal}:`, ((e as Error).message || '').slice(0, 120));
      }
    }
  }

  // ── currencies：保证 NGN / GHS / USDT 存在（仅 INSERT 缺失代码，不删不改已有行） ──
  if (await tableExists('currencies')) {
    const defaults: Array<[string, string, string, string, number]> = [
      ['NGN', '奈拉', 'Naira', 'bg-orange-100 text-orange-700 border-orange-200', 1],
      ['GHS', '赛地', 'Cedi', 'bg-green-100 text-green-700 border-green-200', 2],
      ['USDT', 'USDT', 'USDT', 'bg-blue-100 text-blue-700 border-blue-200', 3],
    ];
    for (const [code, nameZh, nameEn, badge, sort] of defaults) {
      try {
        await execute(
          `INSERT INTO currencies (id, code, name_zh, name_en, badge_color, sort_order, is_active)
           SELECT UUID(), ?, ?, ?, ?, ?, 1 FROM DUAL
           WHERE NOT EXISTS (SELECT 1 FROM currencies c WHERE UPPER(TRIM(c.code)) = ? LIMIT 1)`,
          [code, nameZh, nameEn, badge, sort, code],
        );
      } catch (e: unknown) {
        console.warn(
          `[schema-patch] ensure currency ${code}:`,
          ((e as Error).message || '').slice(0, 120),
        );
      }
    }
  }

  // ── uploaded_images：S3 元数据 + 可见性（私有图禁止匿名直链）──
  if (await tableExists('uploaded_images')) {
    await addCol('uploaded_images', 'storage_backend', "VARCHAR(16) NOT NULL DEFAULT 'mysql'");
    await addCol('uploaded_images', 's3_key', 'VARCHAR(768) NULL');
    await addCol('uploaded_images', 'visibility', "VARCHAR(16) NOT NULL DEFAULT 'public'");
    try {
      await execute(`UPDATE uploaded_images SET visibility = 'private' WHERE tenant_id IS NULL`);
      await execute(`UPDATE uploaded_images SET visibility = 'public' WHERE tenant_id IS NOT NULL`);
    } catch (e: unknown) {
      console.warn('[schema-patch] uploaded_images visibility:', ((e as Error).message || '').slice(0, 120));
    }
    const dataNullRows = await query<{ IS_NULLABLE: string }>(
      `SELECT IS_NULLABLE FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'uploaded_images' AND COLUMN_NAME = 'data' LIMIT 1`,
    );
    if (dataNullRows[0]?.IS_NULLABLE === 'NO') {
      try {
        await execute(`ALTER TABLE uploaded_images MODIFY COLUMN data MEDIUMBLOB NULL`);
      } catch (e: unknown) {
        console.warn('[schema-patch] uploaded_images.data nullable:', ((e as Error).message || '').slice(0, 120));
      }
    }
  }

  // ── 邀请注册：一次性 registerToken + 审计（服务端强校验，禁止仅靠前端 tenant_id）──
  if (!(await tableExists('invite_register_tokens'))) {
    try {
      await execute(`
        CREATE TABLE invite_register_tokens (
          id CHAR(36) NOT NULL PRIMARY KEY,
          token_hash CHAR(64) NOT NULL,
          invite_code VARCHAR(64) NOT NULL,
          tenant_id CHAR(36) NOT NULL,
          referrer_id CHAR(36) NOT NULL,
          expires_at DATETIME(3) NOT NULL,
          used_at DATETIME(3) NULL,
          created_ip VARCHAR(45) NULL,
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          UNIQUE KEY uk_irt_token_hash (token_hash),
          KEY idx_irt_expires (expires_at),
          KEY idx_irt_referrer (referrer_id),
          KEY idx_irt_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } catch (e: unknown) {
      console.warn('[schema-patch] invite_register_tokens:', ((e as Error).message || '').slice(0, 120));
    }
  }
  if (!(await tableExists('invite_register_audit'))) {
    try {
      await execute(`
        CREATE TABLE invite_register_audit (
          id CHAR(36) NOT NULL PRIMARY KEY,
          action VARCHAR(32) NOT NULL,
          invite_code VARCHAR(64) NULL,
          tenant_id CHAR(36) NULL,
          token_id CHAR(36) NULL,
          error_code VARCHAR(64) NULL,
          client_ip VARCHAR(45) NULL,
          user_agent VARCHAR(512) NULL,
          created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          KEY idx_ira_created (created_at),
          KEY idx_ira_tenant (tenant_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    } catch (e: unknown) {
      console.warn('[schema-patch] invite_register_audit:', ((e as Error).message || '').slice(0, 120));
    }
  }

  // ── 邀请排行榜：真实会员累计邀请人数 + 系统假用户（租户维度）──
  await addCol('members', 'invite_count', 'INT NOT NULL DEFAULT 0');
  try {
    await execute(`
      UPDATE members m
      LEFT JOIN (
        SELECT referrer_id, COUNT(*) AS c FROM referrals GROUP BY referrer_id
      ) r ON r.referrer_id = m.id
      SET m.invite_count = COALESCE(r.c, 0)
    `);
  } catch (e: unknown) {
    console.warn('[schema-patch] members.invite_count backfill:', ((e as Error).message || '').slice(0, 120));
  }

  await createTbl(
    'invite_leaderboard_fake_users',
    `CREATE TABLE invite_leaderboard_fake_users (
      id CHAR(36) NOT NULL PRIMARY KEY,
      tenant_id CHAR(36) NOT NULL,
      name VARCHAR(128) NOT NULL,
      base_invite_count INT NOT NULL DEFAULT 0,
      auto_increment_count INT NOT NULL DEFAULT 0,
      growth_cycles INT NOT NULL DEFAULT 0,
      max_growth_cycles INT NOT NULL DEFAULT 30,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      KEY idx_ilfu_tenant (tenant_id),
      KEY idx_ilfu_tenant_active (tenant_id, is_active)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  await createTbl(
    'invite_leaderboard_tenant_growth_schedule',
    `CREATE TABLE invite_leaderboard_tenant_growth_schedule (
      tenant_id CHAR(36) NOT NULL PRIMARY KEY,
      last_fake_growth_at DATETIME(3) NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  await createTbl(
    'invite_leaderboard_job_runs',
    `CREATE TABLE invite_leaderboard_job_runs (
      id CHAR(36) NOT NULL PRIMARY KEY,
      started_at DATETIME(3) NOT NULL,
      finished_at DATETIME(3) NULL,
      tenants_eligible INT NOT NULL DEFAULT 0,
      tenants_processed INT NOT NULL DEFAULT 0,
      fake_rows_updated INT NOT NULL DEFAULT 0,
      message VARCHAR(512) NULL,
      KEY idx_iljr_started (started_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  await createTbl(
    'invite_leaderboard_cron_ticket',
    `CREATE TABLE invite_leaderboard_cron_ticket (
      id TINYINT NOT NULL PRIMARY KEY,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
  try {
    await execute(`INSERT IGNORE INTO invite_leaderboard_cron_ticket (id) VALUES (1)`);
  } catch (e: unknown) {
    console.warn('[schema-patch] invite_leaderboard_cron_ticket seed:', ((e as Error).message || '').slice(0, 120));
  }

  // 邀请榜增长调度：扩展列
  if (await tableExists('invite_leaderboard_tenant_growth_schedule')) {
    await addCol('invite_leaderboard_tenant_growth_schedule', 'next_fake_growth_at', 'DATETIME(3) NULL');
    await addCol('invite_leaderboard_tenant_growth_schedule', 'growth_interval_hours_min', 'INT NOT NULL DEFAULT 72');
    await addCol('invite_leaderboard_tenant_growth_schedule', 'growth_interval_hours_max', 'INT NOT NULL DEFAULT 84');
    await addCol('invite_leaderboard_tenant_growth_schedule', 'growth_delta_min', 'INT NOT NULL DEFAULT 0');
    await addCol('invite_leaderboard_tenant_growth_schedule', 'growth_delta_max', 'INT NOT NULL DEFAULT 3');
    await addCol('invite_leaderboard_tenant_growth_schedule', 'auto_growth_enabled', 'TINYINT(1) NOT NULL DEFAULT 1');
    await addCol('invite_leaderboard_tenant_growth_schedule', 'growth_segment_hours', 'INT NOT NULL DEFAULT 72');
    await addCol('invite_leaderboard_tenant_growth_schedule', 'growth_alloc_mode', "VARCHAR(16) NOT NULL DEFAULT 'random'");
    await addCol('invite_leaderboard_tenant_growth_schedule', 'growth_segment_started_at', 'DATETIME(3) NULL');
    await addCol('invite_leaderboard_tenant_growth_schedule', 'growth_segment_ticks_planned', 'INT NOT NULL DEFAULT 0');
    await addCol('invite_leaderboard_tenant_growth_schedule', 'growth_segment_ticks_done', 'INT NOT NULL DEFAULT 0');
    await addCol('invite_leaderboard_tenant_growth_schedule', 'growth_ticks_min', 'INT NULL');
    await addCol('invite_leaderboard_tenant_growth_schedule', 'growth_ticks_max', 'INT NULL');
    await addCol('invite_leaderboard_tenant_growth_schedule', 'growth_runs_per_user', 'INT NOT NULL DEFAULT 1');
  }

  // 每个假用户独立调度：next_growth_at 记录该用户在本周期内的随机增长时间
  if (await tableExists('invite_leaderboard_fake_users')) {
    await addCol('invite_leaderboard_fake_users', 'next_growth_at', 'DATETIME(3) NULL');
  }

  await createTbl(
    'spin_fake_lottery_hour_run',
    `CREATE TABLE spin_fake_lottery_hour_run (
      tenant_id VARCHAR(36) NOT NULL,
      hour_key VARCHAR(20) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (tenant_id, hour_key),
      KEY idx_spin_fake_hour_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  await createTbl(
    'lottery_sim_fake_settings',
    `CREATE TABLE lottery_sim_fake_settings (
      tenant_id VARCHAR(36) NOT NULL,
      nicknames_raw MEDIUMTEXT NOT NULL,
      pool_json JSON NOT NULL,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  /** 模拟抽奖滚动：独立表，不写入 lottery_logs */
  await createTbl(
    'lottery_simulation_settings',
    `CREATE TABLE lottery_simulation_settings (
      tenant_id VARCHAR(36) NOT NULL PRIMARY KEY,
      retention_days INT NOT NULL DEFAULT 3,
      cron_fake_draws_per_hour INT NOT NULL DEFAULT 20,
      sim_feed_rank_min INT NOT NULL DEFAULT 1,
      sim_feed_rank_max INT NOT NULL DEFAULT 8,
      enable_cron_fake_feed TINYINT(1) NOT NULL DEFAULT 0,
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
  try {
    const hasOld = await colExists('lottery_simulation_settings', 'member_sim_spins_per_day');
    const hasNew = await colExists('lottery_simulation_settings', 'cron_fake_draws_per_hour');
    if (hasOld && !hasNew) {
      await execute(
        `ALTER TABLE lottery_simulation_settings CHANGE COLUMN member_sim_spins_per_day cron_fake_draws_per_hour INT NOT NULL DEFAULT 20`,
      );
      console.log('[schema-patch] lottery_simulation_settings: renamed member_sim_spins_per_day → cron_fake_draws_per_hour');
    }
  } catch (e: unknown) {
    console.warn('[schema-patch] lottery_simulation_settings column rename:', ((e as Error).message || '').slice(0, 160));
  }
  await addCol('lottery_simulation_settings', 'cron_fake_draws_per_hour', 'INT NOT NULL DEFAULT 20');
  await addCol('lottery_simulation_settings', 'sim_feed_rank_min', 'INT NOT NULL DEFAULT 1');
  await addCol('lottery_simulation_settings', 'sim_feed_rank_max', 'INT NOT NULL DEFAULT 8');

  await addCol(
    'lottery_settings',
    'order_completed_spin_enabled',
    "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '交易完成赠送抽奖次数'",
  );
  await addCol(
    'lottery_settings',
    'order_completed_spin_amount',
    "INT NOT NULL DEFAULT 1 COMMENT '每完成一单赠送次数'",
  );
  await addCol(
    'lottery_simulation_settings',
    'cron_fake_anchor_at',
    'DATETIME(3) NULL DEFAULT NULL COMMENT \'模拟执行锚点时间：从此刻起按整点小时轮询；NULL=走上海时区整点\'',
  );
  try {
    await execute(
      `ALTER TABLE spin_fake_lottery_hour_run MODIFY COLUMN hour_key VARCHAR(64) NOT NULL`,
    );
  } catch (e: unknown) {
    const msg = (e as Error).message || '';
    if (!msg.includes('Unknown column') && !msg.includes("doesn't exist")) {
      console.warn('[schema-patch] spin_fake_lottery_hour_run.hour_key widen:', msg.slice(0, 120));
    }
  }

  await createTbl(
    'lottery_simulation_feed',
    `CREATE TABLE lottery_simulation_feed (
      id CHAR(36) NOT NULL PRIMARY KEY,
      tenant_id VARCHAR(36) NOT NULL,
      source VARCHAR(24) NOT NULL,
      feed_text VARCHAR(512) NOT NULL,
      member_id CHAR(36) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY idx_lsf_tenant_created (tenant_id, created_at),
      KEY idx_lsf_member_created (tenant_id, member_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  // ── 积分商城展示分类（租户可增删；商品可选分类；会员端「全部 / 受欢迎的」为虚拟筛选项）──
  await createTbl(
    'member_points_mall_categories',
    `CREATE TABLE member_points_mall_categories (
      id CHAR(36) NOT NULL PRIMARY KEY,
      tenant_id CHAR(36) NOT NULL,
      name_zh VARCHAR(128) NOT NULL,
      name_en VARCHAR(128) NOT NULL DEFAULT '',
      sort_order INT NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      KEY idx_mpmc_tenant (tenant_id),
      KEY idx_mpmc_tenant_sort (tenant_id, sort_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
  await addCol(
    'member_points_mall_items',
    'mall_category_id',
    "CHAR(36) NULL COMMENT '展示分类，可空=仅出现在「全部」'",
  );
  try {
    const { randomUUID } = await import('node:crypto');
    const tenantRows = await query<{ id: string }>(`SELECT id FROM tenants`);
    for (const { id: tid } of tenantRows) {
      const cntRows = await query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM member_points_mall_categories WHERE tenant_id = ?`,
        [tid],
      );
      const cntRow = cntRows[0];
      if (Number(cntRow?.n ?? 0) > 0) continue;
      const id1 = randomUUID();
      const id2 = randomUUID();
      await execute(
        `INSERT INTO member_points_mall_categories (id, tenant_id, name_zh, name_en, sort_order, created_at, updated_at)
         VALUES (?, ?, '优惠券', 'Coupons', 1, NOW(3), NOW(3))`,
        [id1, tid],
      );
      await execute(
        `INSERT INTO member_points_mall_categories (id, tenant_id, name_zh, name_en, sort_order, created_at, updated_at)
         VALUES (?, ?, '礼品', 'Gifts', 2, NOW(3), NOW(3))`,
        [id2, tid],
      );
    }
  } catch (e: unknown) {
    console.warn('[schema-patch] member_points_mall_categories seed:', ((e as Error).message || '').slice(0, 120));
  }

  // ── 邀请页持久统计：成功邀请人数 / 累计获得积分奖励（清理流水或关联表不递减，仅业务递增）──
  await addCol(
    'members',
    'invite_success_lifetime_count',
    'INT NOT NULL DEFAULT 0 COMMENT \'成功邀请注册人数（单调递增）\'',
  );
  await addCol(
    'members',
    'lifetime_reward_points_earned',
    'DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT \'累计获得积分奖励（单调递增）\'',
  );
  try {
    await execute(`
      UPDATE members m
      LEFT JOIN (
        SELECT referrer_id, COUNT(*) AS c FROM referrals GROUP BY referrer_id
      ) r ON r.referrer_id = m.id
      SET m.invite_success_lifetime_count = GREATEST(COALESCE(m.invite_count, 0), COALESCE(r.c, 0))
      WHERE m.invite_success_lifetime_count = 0
    `);
  } catch (e: unknown) {
    console.warn('[schema-patch] invite_success_lifetime_count backfill:', ((e as Error).message || '').slice(0, 120));
  }
  try {
    await execute(`
      UPDATE members m
      LEFT JOIN (
        SELECT member_id, SUM(amount) AS s
        FROM points_ledger
        WHERE amount > 0 AND COALESCE(LOWER(TRIM(type)), '') <> 'redeem_rejected'
        GROUP BY member_id
      ) x ON x.member_id = m.id
      SET m.lifetime_reward_points_earned = COALESCE(x.s, 0)
      WHERE m.lifetime_reward_points_earned = 0
    `);
  } catch (e: unknown) {
    console.warn('[schema-patch] lifetime_reward_points_earned backfill:', ((e as Error).message || '').slice(0, 120));
  }

  // ── 会员晋级：累计积分 + 等级规则表（删除订单/流水不减少 total_points）──
  await createTbl(
    'member_level_rules',
    `CREATE TABLE member_level_rules (
      id CHAR(36) NOT NULL PRIMARY KEY,
      tenant_id CHAR(36) NOT NULL,
      level_name VARCHAR(128) NOT NULL,
      required_points DECIMAL(18,4) NOT NULL DEFAULT 0,
      level_order INT NOT NULL DEFAULT 0,
      rate_bonus DECIMAL(18,6) NULL COMMENT '预留：汇率加成',
      priority_level INT NULL COMMENT '预留：优先级',
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      KEY idx_mlr_tenant (tenant_id),
      KEY idx_mlr_tenant_points (tenant_id, required_points),
      KEY idx_mlr_tenant_order (tenant_id, level_order)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
  await addCol(
    'members',
    'total_points',
    'DECIMAL(18,4) NOT NULL DEFAULT 0 COMMENT \'累计积分（只增不减，等级依据）\'',
  );
  await addCol('members', 'current_level_id', 'CHAR(36) NULL COMMENT \'member_level_rules.id\'');
  try {
    await execute(
      `UPDATE members SET total_points = COALESCE(lifetime_reward_points_earned, 0) WHERE total_points = 0`,
    );
  } catch (e: unknown) {
    console.warn('[schema-patch] members.total_points backfill:', ((e as Error).message || '').slice(0, 120));
  }
  try {
    const { randomUUID } = await import('node:crypto');
    const DEFAULT_LEVELS: ReadonlyArray<readonly [string, number, number]> = [
      ['Starter', 0, 1],
      ['Bronze', 500, 2],
      ['Silver', 2000, 3],
      ['Gold', 5000, 4],
      ['Platinum', 10000, 5],
      ['Diamond', 20000, 6],
      ['Elite', 50000, 7],
    ];
    const tenantRows = await query<{ id: string }>(`SELECT id FROM tenants`);
    for (const { id: tid } of tenantRows) {
      const cntRows = await query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM member_level_rules WHERE tenant_id = ?`,
        [tid],
      );
      if (Number(cntRows[0]?.n ?? 0) > 0) continue;
      for (const [name, pts, ord] of DEFAULT_LEVELS) {
        await execute(
          `INSERT INTO member_level_rules (
             id, tenant_id, level_name, level_name_zh, required_points, level_order, rate_bonus, priority_level, created_at, updated_at
           ) VALUES (?, ?, ?, '', ?, ?, NULL, NULL, NOW(3), NOW(3))`,
          [randomUUID(), tid, name, pts, ord],
        );
      }
    }
  } catch (e: unknown) {
    console.warn('[schema-patch] member_level_rules seed:', ((e as Error).message || '').slice(0, 120));
  }
  try {
    const members = await query<{ id: string; tenant_id: string; total_points: number | string }>(
      `SELECT id, tenant_id, total_points FROM members WHERE tenant_id IS NOT NULL`,
    );
    for (const m of members) {
      const rules = await query<{
        id: string;
        level_name: string;
        required_points: number | string;
        level_order: number | string;
      }>(
        `SELECT id, level_name, required_points, level_order FROM member_level_rules
         WHERE tenant_id = ? ORDER BY required_points ASC, level_order ASC, id ASC`,
        [m.tenant_id],
      );
      if (rules.length === 0) continue;
      const tp = Number(m.total_points) || 0;
      let best = rules[0]!;
      for (const r of rules) {
        const req = Number(r.required_points);
        if (req <= tp) best = r;
      }
      await execute(
        `UPDATE members SET current_level_id = ?, member_level = ?, updated_at = NOW(3) WHERE id = ?`,
        [best.id, best.level_name, m.id],
      );
    }
  } catch (e: unknown) {
    console.warn('[schema-patch] members current_level backfill:', ((e as Error).message || '').slice(0, 120));
  }

  // 后台设备白名单：依赖 data_settings；幂等补表与默认配置（修复历史上先于 schema-patch 执行迁移导致的失败）
  try {
    const { migrateEmployeeDevicesTable } = await import('../modules/adminDeviceWhitelist/migrate.js');
    await migrateEmployeeDevicesTable();
  } catch (e: unknown) {
    console.warn('[schema-patch] employee_devices / admin_device_whitelist:', ((e as Error).message || '').slice(0, 120));
  }

  // 会员等级规则：中文名称（展示用）；level_name 为英文/系统主键名，写入 members.member_level
  await addCol(
    'member_level_rules',
    'level_name_zh',
    "VARCHAR(128) NOT NULL DEFAULT '' COMMENT '等级中文名称（展示）'",
  );

  // 抽奖：可扣减次数存 member_activity，与 spin_credits 发放同步；每日免费单独计数
  await addCol(
    'member_activity',
    'lottery_spin_balance',
    "INT NOT NULL DEFAULT 0 COMMENT '抽奖次数余额（发放递增、抽奖递减）'",
  );
  await addCol(
    'member_activity',
    'lottery_quota_day',
    "DATE NULL COMMENT 'lottery_free_draws_used 对应的上海日历日'",
  );
  await addCol(
    'member_activity',
    'lottery_free_draws_used',
    "INT NOT NULL DEFAULT 0 COMMENT '当日内已消耗的每日免费抽奖次数'",
  );
  try {
    await execute(`
      UPDATE member_activity ma
      LEFT JOIN (
        SELECT member_id, SUM(amount) AS s FROM spin_credits GROUP BY member_id
      ) sc ON sc.member_id = ma.member_id
      SET ma.lottery_spin_balance = GREATEST(0, COALESCE(sc.s, 0))
    `);
  } catch (e: unknown) {
    console.warn('[schema-patch] lottery_spin_balance backfill:', ((e as Error).message || '').slice(0, 120));
  }

  await createTbl(
    'member_inbox_notifications',
    `CREATE TABLE member_inbox_notifications (
      id CHAR(36) NOT NULL PRIMARY KEY,
      tenant_id CHAR(36) NOT NULL,
      member_id CHAR(36) NOT NULL,
      event_type VARCHAR(64) NOT NULL,
      dedupe_key VARCHAR(191) NOT NULL,
      title VARCHAR(512) NOT NULL,
      body MEDIUMTEXT NULL,
      category VARCHAR(32) NOT NULL DEFAULT 'system',
      link VARCHAR(1024) NULL,
      metadata JSON NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_member_inbox_dedupe (member_id, dedupe_key),
      KEY idx_member_inbox_tm_created (tenant_id, member_id, created_at DESC),
      KEY idx_member_inbox_unread (member_id, is_read, created_at DESC)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  // 美卡专区：汇率计算「美卡专区」台位提交的订单在主表 orders 之外登记关联，供订单管理独立列表
  await createTbl(
    'meika_zone_order_links',
    `CREATE TABLE meika_zone_order_links (
      id CHAR(36) NOT NULL PRIMARY KEY,
      tenant_id CHAR(36) NULL,
      order_id CHAR(36) NOT NULL,
      kind ENUM('fiat', 'usdt') NOT NULL COMMENT 'fiat=赛地奈拉 usdt=美卡USDT',
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_meika_order (order_id),
      KEY idx_meika_tenant_kind (tenant_id, kind),
      KEY idx_meika_order_id (order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );

  // ── Phase 1 抽奖系统安全加固 ──

  // lottery_logs: 幂等 request_id + 奖励追踪
  await addCol('lottery_logs', 'request_id', "VARCHAR(64) NULL COMMENT '客户端幂等键'");
  await addCol('lottery_logs', 'reward_status', "VARCHAR(16) NOT NULL DEFAULT 'done' COMMENT 'pending|done|failed'");
  await addCol('lottery_logs', 'retry_count', "TINYINT NOT NULL DEFAULT 0");
  await addCol('lottery_logs', 'fail_reason', "VARCHAR(500) NULL");
  try {
    await execute(`CREATE UNIQUE INDEX uk_lottery_logs_request_id ON lottery_logs (request_id)`);
  } catch { /* index already exists */ }

  // lottery_prizes: 库存控制字段
  await addCol('lottery_prizes', 'stock_total', "INT NOT NULL DEFAULT -1 COMMENT '-1=不限库存'");
  await addCol('lottery_prizes', 'stock_used', "INT NOT NULL DEFAULT 0");
  await addCol('lottery_prizes', 'stock_enabled', "TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否启用库存控制'");
  await addCol('lottery_prizes', 'daily_stock_limit', "INT NOT NULL DEFAULT -1 COMMENT '-1=不限每日'");
  await addCol('lottery_prizes', 'prize_cost', "DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '发奖成本，用于RTP/预算计算'");

  // lottery_settings: 预算 / RTP / 风控基础字段
  await addCol('lottery_settings', 'daily_reward_budget', "DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '每日发奖预算（0=不限）'");
  await addCol('lottery_settings', 'daily_reward_used', "DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '今日已用预算'");
  await addCol('lottery_settings', 'daily_reward_reset_date', "DATE NULL COMMENT '预算已重置的日期'");
  await addCol('lottery_settings', 'target_rtp', "DECIMAL(6,2) NOT NULL DEFAULT 0 COMMENT '目标返奖率(%，0=不限)'");
  await addCol('lottery_settings', 'risk_control_enabled', "TINYINT(1) NOT NULL DEFAULT 0");

  // ── Phase 2 预算 / 返奖率控制 ──
  await addCol('lottery_settings', 'budget_policy', "VARCHAR(16) NOT NULL DEFAULT 'downgrade' COMMENT 'deny=预算耗尽禁抽 downgrade=压权降级 fallback=仅保底奖池'");

  // ── Phase 3 风控最小版 ──

  // lottery_logs: 记录抽奖来源 IP 和设备指纹（用于事后审计 + 频控查询）
  await addCol('lottery_logs', 'client_ip', "VARCHAR(45) NULL COMMENT '抽奖时的客户端 IP'");
  await addCol('lottery_logs', 'device_fingerprint', "VARCHAR(128) NULL COMMENT '客户端设备指纹'");
  try { await execute('CREATE INDEX idx_lottery_logs_ip_created ON lottery_logs (client_ip, created_at)'); } catch { /* exists */ }

  // lottery_settings: 风控阈值（租户级可配）
  await addCol('lottery_settings', 'risk_account_daily_limit', "INT NOT NULL DEFAULT 0 COMMENT '单账号每日抽奖上限（0=不限，超出 RISK_BLOCKED）'");
  await addCol('lottery_settings', 'risk_account_burst_limit', "INT NOT NULL DEFAULT 0 COMMENT '单账号 60s 内抽奖上限（0=不限）'");
  await addCol('lottery_settings', 'risk_ip_daily_limit', "INT NOT NULL DEFAULT 0 COMMENT '同 IP 每日抽奖上限（0=不限）'");
  await addCol('lottery_settings', 'risk_ip_burst_limit', "INT NOT NULL DEFAULT 0 COMMENT '同 IP 60s 内抽奖上限（0=不限）'");
  await addCol('lottery_settings', 'risk_high_score_threshold', "INT NOT NULL DEFAULT 0 COMMENT '风险分阈值，>=此值强制保底（0=不启用）'");

  // ── Phase 4 统一中奖副作用落库 ──

  // lottery_logs: 记录每次抽奖的奖品成本和奖励类型，便于事后审计 + 补偿重试
  await addCol('lottery_logs', 'prize_cost', "DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '本次抽奖的奖品成本（快照，不依赖 join lottery_prizes）'");
  await addCol('lottery_logs', 'reward_type', "VARCHAR(32) NOT NULL DEFAULT 'auto' COMMENT 'auto=自动发放(积分等) manual=需人工确认(custom) none=无需发放'");
  await addCol('lottery_logs', 'reward_points', "INT NOT NULL DEFAULT 0 COMMENT '实际到账积分（与 prize_value 可能不同）'");
  try { await execute('CREATE INDEX idx_lottery_logs_reward_pending ON lottery_logs (reward_status, reward_type, created_at)'); } catch { /* exists */ }

  // ── 安全加固 ──

  // check_ins: 唯一约束保证同一会员同一天不可能重复签到（替代纯 INSERT 错误处理）
  safeIndex('CREATE UNIQUE INDEX uk_check_ins_member_date ON check_ins (member_id, check_in_date)');

  // share_nonces: 分享领奖一次性凭证表（防止无实际分享即领取奖励）
  await createTbl('share_nonces', `
    CREATE TABLE share_nonces (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      member_id VARCHAR(36) NOT NULL,
      tenant_id VARCHAR(36) NULL,
      nonce_hash VARCHAR(64) NOT NULL COMMENT 'SHA-256 of plaintext nonce',
      used_at DATETIME(3) NULL DEFAULT NULL,
      expires_at DATETIME(3) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uk_share_nonces_hash (nonce_hash),
      KEY idx_share_nonces_member (member_id, used_at),
      KEY idx_share_nonces_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // ── 邀请海报设置 ──
  await addCol('member_portal_settings', 'poster_headline_zh', "VARCHAR(200) NULL COMMENT '海报标题(中文)'");
  await addCol('member_portal_settings', 'poster_headline_en', "VARCHAR(200) NULL COMMENT '海报标题(英文)'");
  await addCol('member_portal_settings', 'poster_subtext_zh', "VARCHAR(300) NULL COMMENT '海报副标题(中文)，{spins}替换为次数'");
  await addCol('member_portal_settings', 'poster_subtext_en', "VARCHAR(300) NULL COMMENT '海报副标题(英文)，{spins}替换为次数'");
  await addCol('member_portal_settings', 'poster_footer_zh', "VARCHAR(200) NULL COMMENT '海报底部文字(中文)'");
  await addCol('member_portal_settings', 'poster_footer_en', "VARCHAR(200) NULL COMMENT '海报底部文字(英文)'");
  await addCol('member_portal_settings', 'poster_frame_id', "VARCHAR(20) NOT NULL DEFAULT 'gold' COMMENT '内置海报模板ID'");
  await addCol('member_portal_settings', 'poster_custom_bg_url', "VARCHAR(500) NULL COMMENT '自定义海报背景图URL'");

  // ── members.registration_source：注册来源字段，区分网站数据与全站统计口径 ──
  await addCol(
    'members',
    'registration_source',
    `VARCHAR(32) NULL DEFAULT NULL COMMENT '注册来源: invite_register(前端自助注册链接) | admin_create(后台手工创建) | import(批量导入) | other(其它)'`,
  );
  // 回填：referral_source = 'link' 的是通过前端邀请链接注册的会员
  try {
    await execute(
      `UPDATE members SET registration_source = 'invite_register'
       WHERE registration_source IS NULL AND referral_source = 'link'`,
    );
  } catch (e: unknown) {
    console.warn('[schema-patch] members registration_source invite_register backfill:', ((e as Error).message || '').slice(0, 200));
  }
  // 回填：有 creator_id 或 source_id（后台录入信号），且来源非邀请链接
  try {
    await execute(
      `UPDATE members SET registration_source = 'admin_create'
       WHERE registration_source IS NULL AND (creator_id IS NOT NULL OR source_id IS NOT NULL)`,
    );
  } catch (e: unknown) {
    console.warn('[schema-patch] members registration_source admin_create backfill:', ((e as Error).message || '').slice(0, 200));
  }
  // 其余无法识别的旧数据标记为 other
  try {
    await execute(
      `UPDATE members SET registration_source = 'other' WHERE registration_source IS NULL`,
    );
  } catch (e: unknown) {
    console.warn('[schema-patch] members registration_source other backfill:', ((e as Error).message || '').slice(0, 200));
  }

  // ── points_log 字段补充（单一账本对齐） ──
  await addCol('points_log', 'reference_id', "VARCHAR(36) NULL COMMENT '关联的订单ID/抽奖ID/活动ID'");
  await addCol('points_log', 'balance_after', "DECIMAL(12,2) NULL COMMENT '变动后余额快照'");

  // ── C1连锁: 幂等性查询索引 ──
  try {
    await execute(`ALTER TABLE points_ledger ADD INDEX idx_ref_id_type (reference_id, reference_type)`);
    console.log('[schema-patch] added index idx_ref_id_type on points_ledger');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes('Duplicate key name') && !msg.includes('already exists')) throw e;
  }

  // ── 数据修复：用 points_ledger SUM 校正 points_accounts.balance 偏移 ──
  try {
    const driftRows = await query<{ member_id: string; ledger_sum: number; acct_balance: number }>(
      `SELECT pa.member_id,
              COALESCE((SELECT SUM(amount) FROM points_ledger WHERE member_id = pa.member_id), 0) AS ledger_sum,
              COALESCE(pa.balance, 0) AS acct_balance
       FROM points_accounts pa
       HAVING ABS(ledger_sum - acct_balance) > 0.01
       LIMIT 500`
    );
    if (driftRows.length > 0) {
      console.log(`[schema-patch] reconciling ${driftRows.length} drifted balances…`);
      for (const r of driftRows) {
        const corrected = Math.max(0, Number(r.ledger_sum));
        await execute(
          'UPDATE points_accounts SET balance = ?, updated_at = NOW(3) WHERE member_id = ?',
          [corrected, r.member_id],
        );
      }
      console.log(`[schema-patch] reconciled ${driftRows.length} balances.`);
    }
  } catch (e) {
    console.warn('[schema-patch] balance reconciliation skipped:', e instanceof Error ? e.message : e);
  }

  console.log('[schema-patch] done.');
}
