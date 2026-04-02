/**
 * 会员收件箱通知策略：读取 member_portal_settings，供写入与列表 API 短路。
 */
import { queryOne } from '../../database/index.js';

export interface MemberInboxNotifyPolicy {
  /** 总开关：关则不再写入新通知，列表/未读 API 返回空 */
  inboxEnabled: boolean;
  orderSpin: boolean;
  mallRedemption: boolean;
  announcement: boolean;
}

function boolCol(v: unknown, defaultOn: boolean): boolean {
  if (v === null || v === undefined) return defaultOn;
  if (v === false || v === 0 || v === '0') return false;
  return true;
}

export async function getMemberInboxNotifyPolicy(tenantId: string): Promise<MemberInboxNotifyPolicy> {
  const tid = String(tenantId || '').trim();
  if (!tid) {
    return {
      inboxEnabled: true,
      orderSpin: true,
      mallRedemption: true,
      announcement: true,
    };
  }
  const row = await queryOne<Record<string, unknown>>(
    `SELECT enable_member_inbox, member_inbox_notify_order_spin,
            member_inbox_notify_mall_redemption, member_inbox_notify_announcement
     FROM member_portal_settings WHERE tenant_id = ? LIMIT 1`,
    [tid],
  );
  if (!row) {
    return {
      inboxEnabled: true,
      orderSpin: true,
      mallRedemption: true,
      announcement: true,
    };
  }
  const inboxEnabled = boolCol(row.enable_member_inbox, true);
  return {
    inboxEnabled,
    orderSpin: inboxEnabled && boolCol(row.member_inbox_notify_order_spin, true),
    mallRedemption: inboxEnabled && boolCol(row.member_inbox_notify_mall_redemption, true),
    announcement: inboxEnabled && boolCol(row.member_inbox_notify_announcement, true),
  };
}
