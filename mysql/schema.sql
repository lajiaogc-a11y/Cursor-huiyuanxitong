-- MySQL 8.0 Schema for GC会员系统
-- 从 Supabase (PostgreSQL) 迁移
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;
CREATE DATABASE IF NOT EXISTS gc_member_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gc_member_system;

-- ============================================================
-- 1. tenants (租户表)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenants (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_code VARCHAR(255) NOT NULL UNIQUE,
  tenant_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  admin_employee_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. employees (员工表)
-- ============================================================
CREATE TABLE IF NOT EXISTS employees (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  username VARCHAR(255) NOT NULL,
  name VARCHAR(255) NULL,
  real_name VARCHAR(255) NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) DEFAULT 'staff' NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  visible TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) DEFAULT 1 NOT NULL,
  is_super_admin TINYINT(1) DEFAULT 0 NOT NULL,
  tenant_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_employees_username (username),
  KEY idx_employees_tenant_id (tenant_id),
  CONSTRAINT fk_employees_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 回填 tenants.admin_employee_id 外键
ALTER TABLE tenants ADD CONSTRAINT fk_tenants_admin_employee FOREIGN KEY (admin_employee_id) REFERENCES employees(id);

-- ============================================================
-- 3. profiles (用户配置表)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  employee_id CHAR(36),
  display_name VARCHAR(255),
  avatar_url TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_profiles_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. vendors (供应商表)
-- ============================================================
CREATE TABLE IF NOT EXISTS vendors (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  remark TEXT,
  sort_order INT DEFAULT 0,
  payment_providers JSON DEFAULT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. members (会员表)
-- ============================================================
CREATE TABLE IF NOT EXISTS members (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  phone_number VARCHAR(50) NOT NULL,
  name VARCHAR(255),
  nickname VARCHAR(255),
  level VARCHAR(50) DEFAULT 'normal',
  status VARCHAR(50) DEFAULT 'active' NOT NULL,
  remark TEXT,
  password_hash TEXT,
  wallet_balance DECIMAL(18,2) DEFAULT 0,
  initial_password_sent_at DATETIME(3) NULL,
  tenant_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_members_phone (phone_number),
  KEY idx_members_tenant_id (tenant_id),
  CONSTRAINT fk_members_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. gift_cards (礼品卡表)
-- ============================================================
CREATE TABLE IF NOT EXISTS gift_cards (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_id CHAR(36) NULL,
  card_number VARCHAR(255) NOT NULL,
  vendor_id CHAR(36),
  currency VARCHAR(50) NOT NULL,
  denomination DECIMAL(18,2) NOT NULL,
  rate DECIMAL(18,6),
  status VARCHAR(50) DEFAULT 'pending' NOT NULL,
  remark TEXT,
  image_url TEXT,
  member_id CHAR(36),
  creator_id CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_gift_cards_number (card_number),
  KEY idx_gift_cards_tenant (tenant_id),
  CONSTRAINT fk_gift_cards_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  CONSTRAINT fk_gift_cards_member FOREIGN KEY (member_id) REFERENCES members(id),
  CONSTRAINT fk_gift_cards_creator FOREIGN KEY (creator_id) REFERENCES employees(id),
  CONSTRAINT fk_gift_cards_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. orders (订单表)
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  order_number VARCHAR(255) NOT NULL,
  tenant_id CHAR(36) NULL,
  member_id CHAR(36),
  employee_id CHAR(36),
  account_id CHAR(36) NULL COMMENT '操作员UUID，与 creator_id 对齐',
  vendor_id CHAR(36),
  currency VARCHAR(50),
  amount DECIMAL(18,2),
  rate DECIMAL(18,6),
  total DECIMAL(18,2),
  fee DECIMAL(18,2) DEFAULT 0,
  payment_method VARCHAR(100),
  payment_provider VARCHAR(100),
  status VARCHAR(50) DEFAULT 'pending' NOT NULL,
  remark TEXT,
  foreign_rate DECIMAL(18,6),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_orders_number (order_number),
  KEY idx_orders_member (member_id),
  KEY idx_orders_employee (employee_id),
  KEY idx_orders_tenant (tenant_id),
  CONSTRAINT fk_orders_member FOREIGN KEY (member_id) REFERENCES members(id),
  CONSTRAINT fk_orders_employee FOREIGN KEY (employee_id) REFERENCES employees(id),
  CONSTRAINT fk_orders_vendor FOREIGN KEY (vendor_id) REFERENCES vendors(id),
  CONSTRAINT fk_orders_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. points_accounts (积分账户表)
-- ============================================================
CREATE TABLE IF NOT EXISTS points_accounts (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  member_id CHAR(36) NOT NULL,
  tenant_id CHAR(36) NULL,
  member_code VARCHAR(50) NULL,
  last_updated DATETIME(3) NULL,
  phone VARCHAR(50) NULL,
  last_reset_time DATETIME(3) NULL,
  points_accrual_start_time DATETIME(3) NULL,
  balance DECIMAL(18,2) DEFAULT 0 NOT NULL,
  total_earned DECIMAL(18,2) DEFAULT 0 NOT NULL,
  total_spent DECIMAL(18,2) DEFAULT 0 NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_points_accounts_member (member_id),
  KEY idx_points_accounts_tenant (tenant_id),
  KEY idx_points_accounts_member_code (member_code),
  KEY idx_points_accounts_phone (phone),
  CONSTRAINT fk_points_accounts_member FOREIGN KEY (member_id) REFERENCES members(id),
  CONSTRAINT fk_points_accounts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 9. points_ledger (积分流水表)
-- ============================================================
CREATE TABLE IF NOT EXISTS points_ledger (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  account_id CHAR(36) NOT NULL,
  member_id CHAR(36) NOT NULL,
  tenant_id CHAR(36) NULL,
  type VARCHAR(50) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  balance_after DECIMAL(18,2) NOT NULL,
  reference_type VARCHAR(100),
  reference_id CHAR(36),
  description TEXT,
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_points_ledger_account (account_id),
  KEY idx_points_ledger_member (member_id),
  KEY idx_points_ledger_tenant (tenant_id),
  CONSTRAINT fk_points_ledger_account FOREIGN KEY (account_id) REFERENCES points_accounts(id),
  CONSTRAINT fk_points_ledger_member FOREIGN KEY (member_id) REFERENCES members(id),
  CONSTRAINT fk_points_ledger_creator FOREIGN KEY (created_by) REFERENCES employees(id),
  CONSTRAINT fk_points_ledger_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 10. employee_login_logs (员工登录日志表)
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_login_logs (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  employee_id CHAR(36),
  username VARCHAR(255),
  action VARCHAR(50) NOT NULL,
  ip_address VARCHAR(100),
  user_agent TEXT,
  success TINYINT(1) DEFAULT 1,
  failure_reason TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_login_logs_employee (employee_id),
  CONSTRAINT fk_login_logs_employee FOREIGN KEY (employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 11. audit_records (审计记录表)
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_records (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  submitter_id CHAR(36),
  target_table VARCHAR(255) NOT NULL,
  target_id CHAR(36) NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  old_data JSON,
  new_data JSON NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  reviewer_id CHAR(36),
  review_time DATETIME(3),
  review_comment TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_audit_submitter (submitter_id),
  KEY idx_audit_reviewer (reviewer_id),
  CONSTRAINT fk_audit_submitter FOREIGN KEY (submitter_id) REFERENCES employees(id),
  CONSTRAINT fk_audit_reviewer FOREIGN KEY (reviewer_id) REFERENCES employees(id),
  CONSTRAINT chk_audit_action CHECK (action_type IN ('create', 'update', 'delete')),
  CONSTRAINT chk_audit_status CHECK (status IN ('pending', 'approved', 'rejected'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 12. member_portal_settings (会员门户设置表)
-- ============================================================
CREATE TABLE IF NOT EXISTS member_portal_settings (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL UNIQUE,
  company_name VARCHAR(255) NOT NULL DEFAULT 'Spin & Win',
  logo_url TEXT,
  theme_primary_color VARCHAR(50) NOT NULL DEFAULT '#f59e0b',
  welcome_title VARCHAR(255) NOT NULL DEFAULT 'Premium Member Platform',
  welcome_subtitle VARCHAR(255) NOT NULL DEFAULT 'Sign in to your member account',
  announcement TEXT,
  announcements JSON NULL COMMENT '会员端公告列表(JSON数组)',
  enable_spin TINYINT(1) NOT NULL DEFAULT 1,
  enable_invite TINYINT(1) NOT NULL DEFAULT 1,
  enable_check_in TINYINT(1) NOT NULL DEFAULT 1,
  enable_share_reward TINYINT(1) NOT NULL DEFAULT 1,
  updated_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_portal_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_portal_settings_updater FOREIGN KEY (updated_by) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 13. member_portal_settings_versions (门户设置版本表)
-- ============================================================
CREATE TABLE IF NOT EXISTS member_portal_settings_versions (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  version_no INT NOT NULL,
  payload JSON NOT NULL,
  note TEXT,
  effective_at DATETIME(3),
  is_applied TINYINT(1) NOT NULL DEFAULT 0,
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  applied_at DATETIME(3),
  KEY idx_portal_versions_tenant (tenant_id),
  CONSTRAINT fk_portal_versions_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_portal_versions_creator FOREIGN KEY (created_by) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 14. announcements (公告表)
-- ============================================================
CREATE TABLE IF NOT EXISTS announcements (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'info',
  priority INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  start_at DATETIME(3),
  end_at DATETIME(3),
  target_roles JSON,
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_announcements_tenant (tenant_id),
  CONSTRAINT fk_announcements_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_announcements_creator FOREIGN KEY (created_by) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 15. site_messages (站内消息表)
-- ============================================================
CREATE TABLE IF NOT EXISTS site_messages (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  sender_id CHAR(36),
  recipient_id CHAR(36) NOT NULL,
  recipient_type VARCHAR(50) NOT NULL DEFAULT 'employee',
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  read_at DATETIME(3),
  link_url TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_site_messages_tenant (tenant_id),
  KEY idx_site_messages_recipient (recipient_id),
  CONSTRAINT fk_site_messages_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_site_messages_sender FOREIGN KEY (sender_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 16. spins (转盘记录表)
-- ============================================================
CREATE TABLE IF NOT EXISTS spins (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  member_id CHAR(36),
  spin_type VARCHAR(50) NOT NULL DEFAULT 'wheel',
  source VARCHAR(100) NOT NULL DEFAULT 'member_portal',
  result TEXT,
  prize_id CHAR(36),
  status VARCHAR(50) DEFAULT 'issued',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_spins_member (member_id),
  CONSTRAINT fk_spins_member FOREIGN KEY (member_id) REFERENCES members(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 17. spin_credits (转盘积分表)
-- ============================================================
CREATE TABLE IF NOT EXISTS spin_credits (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  member_id CHAR(36) NOT NULL,
  source VARCHAR(100) NOT NULL,
  amount INT NOT NULL DEFAULT 1,
  used INT NOT NULL DEFAULT 0,
  expires_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_spin_credits_member (member_id),
  CONSTRAINT fk_spin_credits_member FOREIGN KEY (member_id) REFERENCES members(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 18. check_ins (签到表)
-- ============================================================
CREATE TABLE IF NOT EXISTS check_ins (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  member_id CHAR(36) NOT NULL,
  check_in_date DATE NOT NULL,
  streak INT DEFAULT 1,
  points_awarded DECIMAL(18,2) DEFAULT 0,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_checkins_member_date (member_id, check_in_date),
  CONSTRAINT fk_checkins_member FOREIGN KEY (member_id) REFERENCES members(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 19. member_invites (会员邀请表)
-- ============================================================
CREATE TABLE IF NOT EXISTS member_invites (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  inviter_id CHAR(36) NOT NULL,
  invitee_id CHAR(36),
  invitee_phone VARCHAR(50),
  status VARCHAR(50) DEFAULT 'pending',
  reward_issued TINYINT(1) DEFAULT 0,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_invites_inviter (inviter_id),
  CONSTRAINT fk_invites_inviter FOREIGN KEY (inviter_id) REFERENCES members(id),
  CONSTRAINT fk_invites_invitee FOREIGN KEY (invitee_id) REFERENCES members(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 20. member_transactions (会员交易表)
-- ============================================================
CREATE TABLE IF NOT EXISTS member_transactions (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  member_id CHAR(36) NOT NULL,
  type VARCHAR(50) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  balance_after DECIMAL(18,2),
  reference_type VARCHAR(100),
  reference_id CHAR(36),
  description TEXT,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_member_tx_member (member_id),
  CONSTRAINT fk_member_tx_member FOREIGN KEY (member_id) REFERENCES members(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 21. member_spin_wheel_prizes (转盘奖品表)
-- ============================================================
CREATE TABLE IF NOT EXISTS member_spin_wheel_prizes (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  prize_type VARCHAR(50) NOT NULL DEFAULT 'custom',
  hit_rate DECIMAL(10,4) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_spin_prizes_tenant (tenant_id),
  CONSTRAINT fk_spin_prizes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_spin_prizes_creator FOREIGN KEY (created_by) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 22. member_points_mall_items (积分商城商品表，与 server tableProxy RPC 一致)
-- ============================================================
CREATE TABLE IF NOT EXISTS member_points_mall_items (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL DEFAULT '',
  name VARCHAR(255) NULL COMMENT '兼容旧接口，与 title 同步',
  description TEXT,
  image_url TEXT,
  points_cost DECIMAL(18,2) NOT NULL DEFAULT 0,
  stock_remaining INT NOT NULL DEFAULT -1 COMMENT '-1=不限库存',
  stock INT NOT NULL DEFAULT -1 COMMENT '旧列，可与 stock_remaining 同步',
  per_order_limit INT NOT NULL DEFAULT 1,
  per_user_daily_limit INT NOT NULL DEFAULT 0,
  per_user_lifetime_limit INT NOT NULL DEFAULT 0,
  item_type VARCHAR(50) NOT NULL DEFAULT 'physical',
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_mall_items_tenant (tenant_id),
  CONSTRAINT fk_mall_items_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_mall_items_creator FOREIGN KEY (created_by) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 23. redemptions (兑换记录表)
-- ============================================================
CREATE TABLE IF NOT EXISTS redemptions (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  member_id CHAR(36) NOT NULL,
  prize_id CHAR(36),
  item_id CHAR(36),
  type VARCHAR(50) NOT NULL DEFAULT 'prize',
  points_spent DECIMAL(18,2) DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_redemptions_member (member_id),
  CONSTRAINT fk_redemptions_member FOREIGN KEY (member_id) REFERENCES members(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 24. otp_verifications (OTP验证表)
-- ============================================================
CREATE TABLE IF NOT EXISTS otp_verifications (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  phone_number VARCHAR(50) NOT NULL,
  otp_code VARCHAR(20) NOT NULL,
  purpose VARCHAR(50) NOT NULL DEFAULT 'login',
  is_used TINYINT(1) DEFAULT 0,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_otp_phone (phone_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 25. role_permissions (角色权限表)
-- ============================================================
CREATE TABLE IF NOT EXISTS role_permissions (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  role VARCHAR(50) NOT NULL,
  permission VARCHAR(255) NOT NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_role_perm (role, permission)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 26. referral_relations (推荐关系表)
-- ============================================================
CREATE TABLE IF NOT EXISTS referral_relations (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  referrer_id CHAR(36) NULL,
  referee_id CHAR(36) NULL,
  level INT DEFAULT 1,
  referrer_phone VARCHAR(50) NULL,
  referrer_member_code VARCHAR(50) NULL,
  referee_phone VARCHAR(50) NULL,
  referee_member_code VARCHAR(50) NULL,
  source VARCHAR(255) NULL DEFAULT '转介绍',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_referral_referrer (referrer_id),
  KEY idx_referral_referee (referee_id),
  CONSTRAINT fk_referral_referrer FOREIGN KEY (referrer_id) REFERENCES members(id),
  CONSTRAINT fk_referral_referee FOREIGN KEY (referee_id) REFERENCES members(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 27. knowledge_categories (知识库分类表)
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_categories (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_id CHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  sort_order INT DEFAULT 0,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_knowledge_categories_tenant (tenant_id),
  CONSTRAINT fk_knowledge_categories_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 28. knowledge_articles (知识库文章表)
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_articles (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_id CHAR(36) NULL,
  category_id CHAR(36),
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  author_id CHAR(36),
  is_published TINYINT(1) DEFAULT 0,
  sort_order INT DEFAULT 0,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_articles_category (category_id),
  KEY idx_knowledge_articles_tenant (tenant_id),
  CONSTRAINT fk_articles_category FOREIGN KEY (category_id) REFERENCES knowledge_categories(id),
  CONSTRAINT fk_articles_author FOREIGN KEY (author_id) REFERENCES employees(id),
  CONSTRAINT fk_knowledge_articles_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 29. webhooks (Webhook配置表)
-- ============================================================
CREATE TABLE IF NOT EXISTS webhooks (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 30. webhook_delivery_logs (Webhook投递日志表)
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 31. webhook_event_queue (Webhook事件队列表)
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_event_queue (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  payload JSON NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  retry_count INT NOT NULL DEFAULT 0,
  next_retry_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  processed_at DATETIME(3),
  KEY idx_event_queue_tenant (tenant_id),
  KEY idx_event_queue_status (status),
  CONSTRAINT fk_event_queue_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 32. phone_pool (号码池表)
-- ============================================================
CREATE TABLE IF NOT EXISTS phone_pool (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  phone_number VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'available',
  assigned_member_id CHAR(36),
  reserved_by CHAR(36) NULL COMMENT '当前预留该号码的员工',
  reserved_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_phone_pool_number (tenant_id, phone_number),
  KEY idx_phone_pool_tenant (tenant_id),
  CONSTRAINT fk_phone_pool_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_phone_pool_member FOREIGN KEY (assigned_member_id) REFERENCES members(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 33. phone_reservations (号码预留表)
-- ============================================================
CREATE TABLE IF NOT EXISTS phone_reservations (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  phone_id CHAR(36) NOT NULL,
  reserved_by CHAR(36) NULL COMMENT '操作员工，与 user_id 一致；流水型记录可为空',
  purpose VARCHAR(100),
  expires_at DATETIME(3),
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_phone_reservations_tenant (tenant_id),
  CONSTRAINT fk_phone_reservations_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_phone_reservations_phone FOREIGN KEY (phone_id) REFERENCES phone_pool(id) ON DELETE CASCADE,
  CONSTRAINT fk_phone_reservations_employee FOREIGN KEY (reserved_by) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 34. activity_gifts (活动礼品表)
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_gifts (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_id CHAR(36) NULL,
  status VARCHAR(50) NULL DEFAULT 'active',
  currency VARCHAR(50) NOT NULL,
  amount DECIMAL(18,2) NOT NULL,
  rate DECIMAL(18,6) NOT NULL,
  phone_number VARCHAR(50) NOT NULL,
  payment_agent VARCHAR(255) NOT NULL,
  gift_type VARCHAR(50),
  fee DECIMAL(18,2) DEFAULT 0,
  gift_value DECIMAL(18,2) DEFAULT 0,
  gift_number VARCHAR(255),
  remark TEXT,
  creator_id CHAR(36),
  member_id CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_activity_gifts_member (member_id),
  KEY idx_activity_gifts_tenant (tenant_id),
  CONSTRAINT fk_activity_gifts_creator FOREIGN KEY (creator_id) REFERENCES employees(id),
  CONSTRAINT fk_activity_gifts_member FOREIGN KEY (member_id) REFERENCES members(id),
  CONSTRAINT fk_activity_gifts_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 35. activity_settings (活动设置表)
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_settings (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  activity_type VARCHAR(100) NOT NULL,
  config JSON NOT NULL DEFAULT (JSON_OBJECT()),
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 36. merchant_configs (商户配置表)
-- ============================================================
CREATE TABLE IF NOT EXISTS merchant_configs (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  config_key VARCHAR(255) NOT NULL,
  config_value JSON,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_merchant_config (tenant_id, config_key),
  CONSTRAINT fk_merchant_config_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 37. feature_flags (功能开关表 - 全局)
-- ============================================================
CREATE TABLE IF NOT EXISTS feature_flags (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  flag_key VARCHAR(255) NOT NULL UNIQUE,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  description TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 38. tenant_feature_flags (租户功能开关表)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_feature_flags (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  flag_key VARCHAR(255) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_by CHAR(36),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_tenant_flag (tenant_id, flag_key),
  CONSTRAINT fk_tenant_flags_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 39. maintenance_mode (全局维护模式表)
-- ============================================================
CREATE TABLE IF NOT EXISTS maintenance_mode (
  id TINYINT(1) NOT NULL DEFAULT 1 PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  message TEXT,
  allowed_roles JSON,
  updated_by CHAR(36),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_maintenance_singleton CHECK (id = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 40. tenant_maintenance_modes (租户维护模式表)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_maintenance_modes (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL UNIQUE,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  message TEXT,
  allowed_roles JSON,
  updated_by CHAR(36),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_tenant_maintenance_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 41. login_2fa_settings (双因素认证设置表)
-- ============================================================
CREATE TABLE IF NOT EXISTS login_2fa_settings (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL UNIQUE,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  method VARCHAR(50) NOT NULL DEFAULT 'email',
  updated_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_2fa_settings_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 42. error_reports (错误报告表)
-- ============================================================
CREATE TABLE IF NOT EXISTS error_reports (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_id CHAR(36),
  error_type VARCHAR(100) NOT NULL,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  context JSON,
  severity VARCHAR(50) NOT NULL DEFAULT 'error',
  source VARCHAR(100),
  user_id CHAR(36),
  error_id VARCHAR(120) NULL,
  component_stack TEXT NULL,
  url TEXT NULL,
  user_agent TEXT NULL,
  employee_id CHAR(36) NULL,
  resolved TINYINT(1) NOT NULL DEFAULT 0,
  resolved_by CHAR(36),
  resolved_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_error_reports_tenant (tenant_id),
  KEY idx_error_reports_type (error_type),
  CONSTRAINT fk_error_reports_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 43. user_data_store (用户数据存储表)
-- ============================================================
CREATE TABLE IF NOT EXISTS user_data_store (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  store_key VARCHAR(255) NOT NULL,
  store_value JSON,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_user_data_store (user_id, store_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 44. invitation_codes (邀请码表)
-- ============================================================
CREATE TABLE IF NOT EXISTS invitation_codes (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  code VARCHAR(100) NOT NULL UNIQUE,
  tenant_id CHAR(36) NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  member_id CHAR(36) NULL,
  max_uses INT DEFAULT 0,
  used_count INT DEFAULT 0,
  created_by CHAR(36) NULL,
  is_active TINYINT(1) DEFAULT 1,
  expires_at DATETIME(3),
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_invitation_codes_member (member_id),
  KEY idx_invitation_codes_tenant (tenant_id),
  CONSTRAINT fk_invitation_codes_member FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE SET NULL,
  CONSTRAINT fk_invitation_codes_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
  CONSTRAINT fk_invitation_codes_creator FOREIGN KEY (created_by) REFERENCES employees(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 44b. api_keys (API 密钥表，租户维度可选)
-- ============================================================
CREATE TABLE IF NOT EXISTS api_keys (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 45. employee_login_lockout (员工登录锁定表)
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_login_lockout (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  employee_id CHAR(36) NOT NULL,
  failed_attempts INT NOT NULL DEFAULT 0,
  locked_until DATETIME(3),
  last_failed_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_lockout_employee (employee_id),
  CONSTRAINT fk_lockout_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 46. employee_session_controls (员工会话控制表)
-- ============================================================
CREATE TABLE IF NOT EXISTS employee_session_controls (
  employee_id CHAR(36) NOT NULL PRIMARY KEY,
  force_logout_after DATETIME(3),
  force_logout_reason TEXT,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_session_ctrl_employee FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 47. data_backups (数据备份表)
-- ============================================================
CREATE TABLE IF NOT EXISTS data_backups (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  backup_name VARCHAR(255) NOT NULL,
  trigger_type VARCHAR(50) NOT NULL DEFAULT 'manual',
  status VARCHAR(50) NOT NULL DEFAULT 'in_progress',
  tables_backed_up JSON NOT NULL DEFAULT (JSON_ARRAY()),
  record_counts JSON NOT NULL DEFAULT (JSON_OBJECT()),
  total_size_bytes BIGINT NOT NULL DEFAULT 0,
  storage_path TEXT,
  error_message TEXT,
  created_by CHAR(36),
  created_by_name VARCHAR(255) NOT NULL DEFAULT '',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completed_at DATETIME(3),
  CONSTRAINT fk_backups_creator FOREIGN KEY (created_by) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 补充表: shift_receivers (交接班接收人表)
-- ============================================================
CREATE TABLE IF NOT EXISTS shift_receivers (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  sort_order INT DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 补充表: shift_handovers (交接班记录表)
-- ============================================================
CREATE TABLE IF NOT EXISTS shift_handovers (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  handover_employee_id CHAR(36),
  handover_employee_name VARCHAR(255) NOT NULL,
  receiver_name VARCHAR(255) NOT NULL,
  handover_time DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  card_merchant_data JSON,
  total_card_balance DECIMAL(18,2) DEFAULT 0,
  total_card_input DECIMAL(18,2) DEFAULT 0,
  total_card_diff DECIMAL(18,2) DEFAULT 0,
  cash_data JSON,
  total_cash DECIMAL(18,2) DEFAULT 0,
  remark TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_handovers_employee FOREIGN KEY (handover_employee_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 补充表: payment_providers (支付渠道表)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_providers (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'active',
  sort_order INT DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 补充表: activity_types (活动类型表)
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_types (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  is_active TINYINT(1) DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 补充表: activity_reward_tiers (活动奖励等级表)
-- ============================================================
CREATE TABLE IF NOT EXISTS activity_reward_tiers (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  min_points INT NOT NULL,
  max_points INT,
  reward_amount_ngn DECIMAL(20,2) DEFAULT 0,
  reward_amount_ghs DECIMAL(20,2) DEFAULT 0,
  reward_amount_usdt DECIMAL(20,8) DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 补充表: risk_scores（员工维度，与 /api/risk 一致；旧版按 member 的表由启动迁移重命名为 risk_scores_legacy_by_member）
-- ============================================================
CREATE TABLE IF NOT EXISTS risk_scores (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  employee_id CHAR(36) NOT NULL,
  current_score INT NOT NULL DEFAULT 0,
  risk_level VARCHAR(20) NOT NULL DEFAULT 'low',
  factors JSON NULL,
  last_calculated_at DATETIME(3) NULL,
  auto_action_taken VARCHAR(100) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_risk_scores_employee (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 补充表: prizes (奖品表)
-- ============================================================
CREATE TABLE IF NOT EXISTS prizes (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  points_required DECIMAL(18,2) DEFAULT 0,
  stock INT DEFAULT -1,
  auto_issue TINYINT(1) DEFAULT 0,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 补充表: shared_data_store (共享数据存储表)
-- ============================================================
CREATE TABLE IF NOT EXISTS shared_data_store (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  store_key VARCHAR(255) NOT NULL,
  store_value JSON,
  tenant_id CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uk_shared_data_key (store_key),
  CONSTRAINT fk_shared_data_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 补充表: task_templates (任务模板表)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_templates (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  module VARCHAR(100) NOT NULL,
  description TEXT,
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_task_templates_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_templates_creator FOREIGN KEY (created_by) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 补充表: tasks (任务表)
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  template_id CHAR(36),
  title VARCHAR(255) NOT NULL,
  total_items INT NOT NULL DEFAULT 0 COMMENT '客户维护等：子任务条数',
  source_page VARCHAR(255) NULL COMMENT '客户维护：来源页面标识',
  description TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  priority VARCHAR(50) NOT NULL DEFAULT 'medium',
  assigned_to CHAR(36),
  due_date DATETIME(3),
  completed_at DATETIME(3),
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  KEY idx_tasks_tenant (tenant_id),
  KEY idx_tasks_assigned (assigned_to),
  CONSTRAINT fk_tasks_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT fk_tasks_template FOREIGN KEY (template_id) REFERENCES task_templates(id),
  CONSTRAINT fk_tasks_assignee FOREIGN KEY (assigned_to) REFERENCES employees(id),
  CONSTRAINT fk_tasks_creator FOREIGN KEY (created_by) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 补充表: task_comments (任务评论表)
-- ============================================================
CREATE TABLE IF NOT EXISTS task_comments (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  task_id CHAR(36) NOT NULL,
  author_id CHAR(36) NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_task_comments_task (task_id),
  CONSTRAINT fk_task_comments_task FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_comments_author FOREIGN KEY (author_id) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 补充表: tenant_migration_jobs (租户迁移任务表)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_migration_jobs (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  source_tenant_id CHAR(36) NOT NULL,
  target_tenant_id CHAR(36) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  tables_config JSON NOT NULL,
  progress JSON,
  started_at DATETIME(3),
  completed_at DATETIME(3),
  error_message TEXT,
  created_by CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_migration_jobs_source FOREIGN KEY (source_tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_migration_jobs_target FOREIGN KEY (target_tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_migration_jobs_creator FOREIGN KEY (created_by) REFERENCES employees(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 补充表: tenant_migration_rollbacks (租户迁移回滚表)
-- ============================================================
CREATE TABLE IF NOT EXISTS tenant_migration_rollbacks (
  id CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
  job_id CHAR(36) NOT NULL,
  table_name VARCHAR(255) NOT NULL,
  record_key VARCHAR(255) NOT NULL,
  action VARCHAR(50) NOT NULL,
  before_data JSON,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_rollbacks_job (job_id),
  CONSTRAINT fk_rollbacks_job FOREIGN KEY (job_id) REFERENCES tenant_migration_jobs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 完成
-- ============================================================
-- 总计: 47+ 张核心表 + 补充表
-- 所有 PostgreSQL 特有语法已转换为 MySQL 8.0 兼容语法
-- UUID 主键使用 CHAR(36) + DEFAULT (UUID())
-- timestamptz → DATETIME(3) + CURRENT_TIMESTAMP(3)
-- jsonb → JSON
-- boolean → TINYINT(1)
-- text[] → JSON
-- numeric → DECIMAL(18,2)
-- GIN 索引和条件索引已移除
