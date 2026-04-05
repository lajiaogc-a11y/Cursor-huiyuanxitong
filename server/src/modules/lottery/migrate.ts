/**
 * 抽奖系统数据库迁移
 * 独立执行: cd server && npm run migrate:lottery（见 runLotteryMigrate.ts）
 */
import { execute, query } from '../../database/index.js';

export async function migrateLotteryTables(): Promise<void> {
  // 1. lottery_prizes — 奖品表（重用/升级 member_spin_wheel_prizes 概念，但独立建表以免影响旧数据）
  await execute(`
    CREATE TABLE IF NOT EXISTS lottery_prizes (
      id          CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
      tenant_id   CHAR(36) NULL,
      name        VARCHAR(255) NOT NULL,
      type        ENUM('points','custom','none') NOT NULL DEFAULT 'custom',
      value       INT NOT NULL DEFAULT 0 COMMENT '积分数量（仅 type=points 有效）',
      description VARCHAR(500) NULL COMMENT '自定义奖品描述',
      probability DECIMAL(6,2) NOT NULL DEFAULT 0 COMMENT '中奖概率(%)',
      image_url   VARCHAR(1000) NULL,
      sort_order  INT NOT NULL DEFAULT 0,
      enabled     TINYINT(1) NOT NULL DEFAULT 1,
      created_by  CHAR(36) NULL,
      created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      KEY idx_lottery_prizes_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 2. lottery_logs — 抽奖记录
  await execute(`
    CREATE TABLE IF NOT EXISTS lottery_logs (
      id          CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
      member_id   CHAR(36) NOT NULL,
      tenant_id   CHAR(36) NULL,
      prize_id    CHAR(36) NULL,
      prize_name  VARCHAR(255) NOT NULL,
      prize_type  ENUM('points','custom','none') NOT NULL,
      prize_value INT NOT NULL DEFAULT 0,
      created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY idx_lottery_logs_member (member_id),
      KEY idx_lottery_logs_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 3. points_log — 积分流水
  await execute(`
    CREATE TABLE IF NOT EXISTS points_log (
      id          CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
      member_id   CHAR(36) NOT NULL,
      tenant_id   CHAR(36) NULL,
      \`change\`  DECIMAL(12,2) NOT NULL COMMENT '变动数量(正/负)',
      type        VARCHAR(50) NOT NULL COMMENT 'lottery / order / manual / ...',
      category    VARCHAR(50) NOT NULL DEFAULT 'online_points' COMMENT 'online_points / referral_points',
      remark      VARCHAR(500) NULL,
      created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY idx_points_log_member (member_id),
      KEY idx_points_log_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 4. member_activity 加 online_points 列（若不存在）
  const cols = await query<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_activity' AND COLUMN_NAME = 'online_points'`
  );
  if (cols.length === 0) {
    await execute(
      `ALTER TABLE member_activity ADD COLUMN online_points DECIMAL(18,2) NOT NULL DEFAULT 0 AFTER referral_points`
    );
  }

  // 5. lottery_settings — 抽奖全局设置（每日次数等）
  await execute(`
    CREATE TABLE IF NOT EXISTS lottery_settings (
      id                CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
      tenant_id         CHAR(36) NULL UNIQUE,
      daily_free_spins  INT NOT NULL DEFAULT 0,
      enabled           TINYINT(1) NOT NULL DEFAULT 1,
      updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 6. member_portal_settings — 添加每日邀请/分享奖励上限字段
  const portalCols = await query<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_portal_settings'
       AND COLUMN_NAME IN ('daily_invite_reward_limit', 'daily_share_reward_limit')`
  );
  const existing = new Set(portalCols.map(r => r.COLUMN_NAME));
  if (!existing.has('daily_invite_reward_limit')) {
    await execute(`ALTER TABLE member_portal_settings ADD COLUMN daily_invite_reward_limit INT NOT NULL DEFAULT 0 COMMENT '每日邀请奖励上限（0=不限）'`);
  }
  if (!existing.has('daily_share_reward_limit')) {
    await execute(`ALTER TABLE member_portal_settings ADD COLUMN daily_share_reward_limit INT NOT NULL DEFAULT 0 COMMENT '每日分享奖励上限（0=不限）'`);
  }

  // 7. uploaded_images — 图片上传存储表
  await execute(`
    CREATE TABLE IF NOT EXISTS uploaded_images (
      id          CHAR(36) NOT NULL DEFAULT (UUID()) PRIMARY KEY,
      tenant_id   CHAR(36) NULL,
      data        MEDIUMBLOB NOT NULL COMMENT '图片二进制数据',
      content_type VARCHAR(50) NOT NULL DEFAULT 'image/webp',
      file_name   VARCHAR(255) NULL,
      size_bytes  INT NOT NULL DEFAULT 0,
      created_by  CHAR(36) NULL,
      created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY idx_uploaded_images_tenant (tenant_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 8. redemptions 表扩展积分商城字段
  const redemptionCols = await query<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'redemptions'
       AND COLUMN_NAME IN ('mall_item_id','quantity','points_used','item_title','item_image_url','item_description','process_note','processed_at')`
  );
  const existingRedemptionCols = new Set(redemptionCols.map(r => r.COLUMN_NAME));
  if (!existingRedemptionCols.has('mall_item_id')) {
    await execute(`ALTER TABLE redemptions ADD COLUMN mall_item_id CHAR(36) NULL`);
  }
  if (!existingRedemptionCols.has('quantity')) {
    await execute(`ALTER TABLE redemptions ADD COLUMN quantity INT NOT NULL DEFAULT 1`);
  }
  if (!existingRedemptionCols.has('points_used')) {
    await execute(`ALTER TABLE redemptions ADD COLUMN points_used DECIMAL(18,2) NULL`);
  }
  if (!existingRedemptionCols.has('item_title')) {
    await execute(`ALTER TABLE redemptions ADD COLUMN item_title TEXT NULL`);
  }
  if (!existingRedemptionCols.has('item_image_url')) {
    await execute(`ALTER TABLE redemptions ADD COLUMN item_image_url TEXT NULL`);
  }
  if (!existingRedemptionCols.has('item_description')) {
    await execute(`ALTER TABLE redemptions ADD COLUMN item_description TEXT NULL`);
  }
  if (!existingRedemptionCols.has('process_note')) {
    await execute(`ALTER TABLE redemptions ADD COLUMN process_note TEXT NULL`);
  }
  if (!existingRedemptionCols.has('processed_at')) {
    await execute(`ALTER TABLE redemptions ADD COLUMN processed_at DATETIME(3) NULL`);
  }

  // 9. member_points_mall_items — 与 tableProxy RPC 对齐（旧 schema 只有 name/stock，会导致 i.title / stock_remaining 报错）
  const mallItemCols = await query<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'member_points_mall_items'`,
  );
  const mallSet = new Set(mallItemCols.map((r) => r.COLUMN_NAME));
  if (mallSet.size > 0) {
    if (!mallSet.has('title')) {
      await execute(
        `ALTER TABLE member_points_mall_items ADD COLUMN title VARCHAR(255) NOT NULL DEFAULT '' COMMENT '商品标题（与前端/API 一致）'`,
      );
      if (mallSet.has('name')) {
        await execute(`UPDATE member_points_mall_items SET title = name WHERE title = '' OR title IS NULL`);
      } else {
        await execute(`UPDATE member_points_mall_items SET title = 'Product' WHERE title = '' OR title IS NULL`);
      }
      mallSet.add('title');
    }
    if (!mallSet.has('name')) {
      await execute(
        `ALTER TABLE member_points_mall_items ADD COLUMN name VARCHAR(255) NULL COMMENT '兼容旧列，与 title 同步'`,
      );
      await execute(`UPDATE member_points_mall_items SET name = NULLIF(title, '') WHERE name IS NULL OR name = ''`);
      mallSet.add('name');
    }
    if (!mallSet.has('stock_remaining')) {
      await execute(
        `ALTER TABLE member_points_mall_items ADD COLUMN stock_remaining INT NOT NULL DEFAULT -1 COMMENT '-1=不限库存'`,
      );
      if (mallSet.has('stock')) {
        await execute(`UPDATE member_points_mall_items SET stock_remaining = stock`);
      }
      mallSet.add('stock_remaining');
    }
    if (!mallSet.has('per_order_limit')) {
      await execute(
        `ALTER TABLE member_points_mall_items ADD COLUMN per_order_limit INT NOT NULL DEFAULT 1`,
      );
    }
    if (!mallSet.has('per_user_daily_limit')) {
      await execute(
        `ALTER TABLE member_points_mall_items ADD COLUMN per_user_daily_limit INT NOT NULL DEFAULT 0`,
      );
    }
    if (!mallSet.has('per_user_lifetime_limit')) {
      await execute(
        `ALTER TABLE member_points_mall_items ADD COLUMN per_user_lifetime_limit INT NOT NULL DEFAULT 0`,
      );
    }
    // 写入 RPC 后尽量保持 name 与 title 一致（旧客户端若读 name）
    try {
      await execute(
        `UPDATE member_points_mall_items SET name = title WHERE (name IS NULL OR name = '') AND title IS NOT NULL AND title <> ''`,
      );
    } catch {
      /* ignore */
    }
  }

  // 10b. lottery_settings — 会员端「概率说明」文案（与抽奖配置同页维护）
  const lsCols = await query<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lottery_settings' AND COLUMN_NAME = 'probability_notice'`,
  );
  if (lsCols.length === 0) {
    await execute(
      `ALTER TABLE lottery_settings ADD COLUMN probability_notice TEXT NULL COMMENT '会员端概率说明（弹窗）' AFTER enabled`,
    );
  }

  // 10c. lottery_settings — 交易完成赠送抽奖次数
  const lsOrderSpinCols = await query<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lottery_settings'
       AND COLUMN_NAME IN ('order_completed_spin_enabled','order_completed_spin_amount')`,
  );
  const lsOrderSpin = new Set(lsOrderSpinCols.map((r) => r.COLUMN_NAME));
  if (!lsOrderSpin.has('order_completed_spin_enabled')) {
    await execute(
      `ALTER TABLE lottery_settings ADD COLUMN order_completed_spin_enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT '交易完成赠送抽奖次数' AFTER probability_notice`,
    );
  }
  if (!lsOrderSpin.has('order_completed_spin_amount')) {
    await execute(
      `ALTER TABLE lottery_settings ADD COLUMN order_completed_spin_amount INT NOT NULL DEFAULT 1 COMMENT '每完成一单赠送次数' AFTER order_completed_spin_enabled`,
    );
  }

  // 10. lottery_prizes.probability 精度升级 — 支持极小权重如 0.0000001
  const [probCol] = await query<{ COLUMN_TYPE: string }>(
    `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lottery_prizes' AND COLUMN_NAME = 'probability'`
  );
  if (probCol && !probCol.COLUMN_TYPE.includes('16,10')) {
    await execute(`ALTER TABLE lottery_prizes MODIFY COLUMN probability DECIMAL(16,10) NOT NULL DEFAULT 0 COMMENT '中奖权重'`);
  }

  // 11. lottery_prizes.display_probability — 会员端公示用，不参与抽奖算法
  const dispProbCols = await query<{ COLUMN_NAME: string }>(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lottery_prizes' AND COLUMN_NAME = 'display_probability'`,
  );
  if (dispProbCols.length === 0) {
    await execute(
      `ALTER TABLE lottery_prizes ADD COLUMN display_probability DECIMAL(16,10) NULL COMMENT '前端展示用中奖概率(%)，NULL=展示真实 probability' AFTER probability`,
    );
  } else {
    const [dispCol] = await query<{ COLUMN_TYPE: string }>(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'lottery_prizes' AND COLUMN_NAME = 'display_probability'`
    );
    if (dispCol && !dispCol.COLUMN_TYPE.includes('16,10')) {
      await execute(`ALTER TABLE lottery_prizes MODIFY COLUMN display_probability DECIMAL(16,10) NULL COMMENT '前端展示用中奖概率(%)，NULL=展示真实 probability'`);
    }
  }

  console.log('[lottery] Migration complete');
}
