/**
 * 一次性：历史「商城兑换待审核」在旧逻辑下已从 balance 直扣、frozen 为 0。
 * 回填 frozen_points += 各会员待审核商城单积分之和，与会员端「冻结待审核」展示及 HAS_FROZEN_POINTS 一致。
 */
import { execute } from '../../database/index.js';

export async function backfillMallPendingFrozenPoints(): Promise<void> {
  await execute(`
    UPDATE points_accounts pa
    INNER JOIN (
      SELECT member_id, SUM(COALESCE(points_used, 0)) AS s
      FROM redemptions
      WHERE LOWER(TRIM(COALESCE(status, ''))) = 'pending'
        AND (mall_item_id IS NOT NULL OR LOWER(TRIM(COALESCE(type, ''))) = 'mall')
      GROUP BY member_id
    ) t ON t.member_id = pa.member_id
    SET pa.frozen_points = COALESCE(pa.frozen_points, 0) + t.s
  `);
}
