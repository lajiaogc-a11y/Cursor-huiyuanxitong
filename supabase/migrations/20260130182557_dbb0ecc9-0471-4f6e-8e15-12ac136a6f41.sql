-- 修复 delete_activity_gift_and_restore 函数
-- 在删除活动赠送时，检查是否有活跃订单，如果没有则跳过利润恢复

CREATE OR REPLACE FUNCTION public.delete_activity_gift_and_restore(p_gift_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_gift RECORD;
  v_member RECORD;
  v_ledger_entry RECORD;
  v_restored_points INTEGER := 0;
  v_should_restore_profit BOOLEAN := true;
  v_active_order_count INTEGER := 0;
BEGIN
  -- 1) Get the gift record to delete
  SELECT * INTO v_gift FROM activity_gifts WHERE id = p_gift_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'GIFT_NOT_FOUND');
  END IF;

  -- 2) Get member info
  SELECT * INTO v_member FROM members WHERE id = v_gift.member_id;

  IF NOT FOUND THEN
    DELETE FROM activity_gifts WHERE id = p_gift_id;
    RETURN json_build_object('success', true, 'restored_points', 0, 'restored_amount', v_gift.amount, 'currency', v_gift.currency);
  END IF;

  -- 3) 检查该会员是否还有未删除的订单
  -- 如果所有订单都被删除了，则不应恢复利润（利润已经通过订单删除回收）
  SELECT COUNT(*) INTO v_active_order_count
  FROM orders
  WHERE phone_number = v_gift.phone_number
    AND is_deleted = false;
  
  -- 如果没有活跃订单，跳过利润恢复
  IF v_active_order_count = 0 THEN
    v_should_restore_profit := false;
  END IF;

  -- 4) Find associated points deduction record (negative points in ledger)
  SELECT * INTO v_ledger_entry 
  FROM points_ledger 
  WHERE member_id = v_gift.member_id
    AND transaction_type IN ('redeem_activity_1', 'redeem_activity_2', 'redemption')
    AND points_earned < 0
    AND status = 'issued'
    AND ABS(EXTRACT(EPOCH FROM (created_at - v_gift.created_at))) < 5
  LIMIT 1;

  -- 5) Delete the points deduction record if found (points automatically restored)
  IF v_ledger_entry.id IS NOT NULL THEN
    v_restored_points := ABS(v_ledger_entry.points_earned);
    DELETE FROM points_ledger WHERE id = v_ledger_entry.id;
  END IF;

  -- 6) Restore gift amounts in member_activity
  -- 只有当存在活跃订单时才恢复利润
  UPDATE member_activity
  SET
    total_gift_ngn = CASE WHEN v_gift.currency = 'NGN' THEN GREATEST(0, COALESCE(total_gift_ngn, 0) - v_gift.amount) ELSE total_gift_ngn END,
    total_gift_ghs = CASE WHEN v_gift.currency = 'GHS' THEN GREATEST(0, COALESCE(total_gift_ghs, 0) - v_gift.amount) ELSE total_gift_ghs END,
    total_gift_usdt = CASE WHEN v_gift.currency = 'USDT' THEN GREATEST(0, COALESCE(total_gift_usdt, 0) - v_gift.amount) ELSE total_gift_usdt END,
    -- 只有存在活跃订单时才恢复利润
    accumulated_profit = CASE 
      WHEN v_should_restore_profit THEN COALESCE(accumulated_profit, 0) + COALESCE(v_gift.gift_value, 0)
      ELSE accumulated_profit
    END,
    last_reset_time = NULL,
    updated_at = now()
  WHERE member_id = v_gift.member_id;

  -- 7) Reset points_accounts last_reset_time to recalculate all points
  UPDATE points_accounts
  SET 
    last_reset_time = NULL,
    current_points = 0,
    last_updated = now()
  WHERE member_code = v_member.member_code;

  -- 8) Delete the activity gift record
  DELETE FROM activity_gifts WHERE id = p_gift_id;

  RETURN json_build_object(
    'success', true,
    'restored_points', v_restored_points,
    'restored_amount', v_gift.amount,
    'currency', v_gift.currency,
    'profit_restored', v_should_restore_profit
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;