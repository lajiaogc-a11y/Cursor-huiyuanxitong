/**
 * 会员门户设置表列补齐（启动时幂等执行）
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

export async function migrateMemberPortalSettingsColumns(): Promise<void> {
  if (!(await columnExists('member_portal_settings', 'announcements'))) {
    await execute(
      `ALTER TABLE member_portal_settings ADD COLUMN announcements JSON NULL COMMENT '会员端公告列表(JSON数组)'`,
    );
    console.log('[member_portal_settings] added column announcements');
  }
  try {
    await execute(`ALTER TABLE member_portal_settings DROP COLUMN contact_redeem_min_points`);
    console.log('[member_portal_settings] dropped column contact_redeem_min_points');
  } catch {
    /* 列不存在或已删除 */
  }
  if (!(await columnExists('member_portal_settings', 'home_points_balance_hint_zh'))) {
    await execute(
      `ALTER TABLE member_portal_settings ADD COLUMN home_points_balance_hint_zh TEXT NULL COMMENT '会员首页当前积分说明（中文）；空则前端默认文案'`,
    );
    console.log('[member_portal_settings] added column home_points_balance_hint_zh');
  }
  if (!(await columnExists('member_portal_settings', 'home_points_balance_hint_en'))) {
    await execute(
      `ALTER TABLE member_portal_settings ADD COLUMN home_points_balance_hint_en TEXT NULL COMMENT '会员首页当前积分说明（英文）；空则前端默认文案'`,
    );
    console.log('[member_portal_settings] added column home_points_balance_hint_en');
  }
  if (!(await columnExists('member_portal_settings', 'announcement_popup_frequency'))) {
    await execute(
      `ALTER TABLE member_portal_settings ADD COLUMN announcement_popup_frequency VARCHAR(24) NULL COMMENT '公告弹窗频率 off|every_login|daily_first'`,
    );
    console.log('[member_portal_settings] added column announcement_popup_frequency');
  }
  if (!(await columnExists('member_portal_settings', 'home_first_trade_contact_zh'))) {
    await execute(
      `ALTER TABLE member_portal_settings ADD COLUMN home_first_trade_contact_zh TEXT NULL COMMENT '首页首笔交易联系客服说明（中文）'`,
    );
    console.log('[member_portal_settings] added column home_first_trade_contact_zh');
  }
  if (!(await columnExists('member_portal_settings', 'home_first_trade_contact_en'))) {
    await execute(
      `ALTER TABLE member_portal_settings ADD COLUMN home_first_trade_contact_en TEXT NULL COMMENT '首页首笔交易联系客服说明（英文）'`,
    );
    console.log('[member_portal_settings] added column home_first_trade_contact_en');
  }
}
