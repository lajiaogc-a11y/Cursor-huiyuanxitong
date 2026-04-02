/**
 * 会员商城兑换流水曾未写入 member_code / phone_number / status，导致活动数据「积分流水」查不到。
 * 幂等：仅补齐空字段。
 */
import { execute } from '../../database/index.js';

export async function migrateMallRedemptionLedgerMetadata(): Promise<void> {
  try {
    await execute(
      `UPDATE points_ledger pl
       INNER JOIN members m ON m.id = pl.member_id
       SET
         pl.member_code = IFNULL(NULLIF(TRIM(pl.member_code), ''), m.member_code),
         pl.phone_number = IFNULL(NULLIF(TRIM(pl.phone_number), ''), m.phone_number),
         pl.status = CASE
           WHEN pl.status IS NULL OR TRIM(pl.status) = '' THEN 'issued'
           ELSE pl.status
         END,
         pl.transaction_type = CASE
           WHEN (pl.transaction_type IS NULL OR TRIM(pl.transaction_type) = '')
             AND pl.reference_type <=> 'mall_redemption'
           THEN 'mall_redemption'
           ELSE pl.transaction_type
         END,
         pl.points_earned = COALESCE(pl.points_earned, pl.amount)
       WHERE pl.reference_type <=> 'mall_redemption'`,
    );
  } catch (e) {
    console.warn('[migrateMallRedemptionLedgerMetadata]', (e as Error).message);
  }
}
