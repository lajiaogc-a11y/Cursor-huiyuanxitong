-- Create RPC function for deleting activity gift and restoring points
CREATE OR REPLACE FUNCTION public.delete_activity_gift_and_restore(
  p_gift_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_gift RECORD;
  v_member RECORD;
  v_ledger_entry RECORD;
BEGIN
  -- 1) Get the gift record to delete
  SELECT * INTO v_gift FROM activity_gifts WHERE id = p_gift_id;
  
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'GIFT_NOT_FOUND');
  END IF;

  -- 2) Get member info
  SELECT * INTO v_member FROM members WHERE id = v_gift.member_id;

  -- 3) Find associated points deduction record (negative points in ledger)
  -- Match by member_id, transaction type, negative points, and time proximity (within 5 seconds)
  SELECT * INTO v_ledger_entry 
  FROM points_ledger 
  WHERE member_id = v_gift.member_id
    AND transaction_type IN ('redeem_activity_1', 'redeem_activity_2', 'redemption')
    AND points_earned < 0
    AND ABS(EXTRACT(EPOCH FROM (created_at - v_gift.created_at))) < 5
  LIMIT 1;

  -- 4) Delete the points deduction record if found (points automatically restored)
  IF v_ledger_entry.id IS NOT NULL THEN
    DELETE FROM points_ledger WHERE id = v_ledger_entry.id;
  END IF;

  -- 5) Restore gift amounts in member_activity
  UPDATE member_activity
  SET
    total_gift_ngn = CASE WHEN v_gift.currency = 'NGN' THEN GREATEST(0, COALESCE(total_gift_ngn, 0) - v_gift.amount) ELSE total_gift_ngn END,
    total_gift_ghs = CASE WHEN v_gift.currency = 'GHS' THEN GREATEST(0, COALESCE(total_gift_ghs, 0) - v_gift.amount) ELSE total_gift_ghs END,
    total_gift_usdt = CASE WHEN v_gift.currency = 'USDT' THEN GREATEST(0, COALESCE(total_gift_usdt, 0) - v_gift.amount) ELSE total_gift_usdt END,
    accumulated_profit = COALESCE(accumulated_profit, 0) + COALESCE(v_gift.gift_value, 0),
    last_reset_time = NULL,
    updated_at = now()
  WHERE member_id = v_gift.member_id;

  -- 6) Reset points_accounts last_reset_time to recalculate all points
  UPDATE points_accounts
  SET 
    last_reset_time = NULL,
    last_updated = now()
  WHERE member_code = v_member.member_code;

  -- 7) Delete the activity gift record
  DELETE FROM activity_gifts WHERE id = p_gift_id;

  RETURN json_build_object(
    'success', true,
    'restored_points', ABS(COALESCE(v_ledger_entry.points_earned, 0)),
    'restored_amount', v_gift.amount,
    'currency', v_gift.currency
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;