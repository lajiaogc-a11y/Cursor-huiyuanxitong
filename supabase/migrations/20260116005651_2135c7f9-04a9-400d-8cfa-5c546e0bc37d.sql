-- Fix: pass timestamptz directly instead of casting to text
CREATE OR REPLACE FUNCTION public.redeem_points_and_record(
  p_member_code text,
  p_phone text,
  p_member_id uuid,
  p_points_to_redeem integer,
  p_activity_type text,
  p_gift_currency text,
  p_gift_amount numeric,
  p_gift_rate numeric,
  p_gift_fee numeric,
  p_gift_value numeric,
  p_payment_agent text,
  p_creator_id uuid,
  p_creator_name text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_points INTEGER;
  v_last_reset_time timestamptz;
  v_new_cycle_id UUID;
  v_gift_id UUID;
  v_ledger_id UUID;
  v_transaction_type TEXT;
BEGIN
  -- 1) Read member's last reset time (if any)
  SELECT ma.last_reset_time
  INTO v_last_reset_time
  FROM member_activity ma
  WHERE ma.member_id = p_member_id
  LIMIT 1;

  -- 2) Compute current redeemable points from ledger (source of truth)
  -- Pass timestamptz directly, not as text
  SELECT COALESCE(public.calculate_member_points(p_member_code, v_last_reset_time), 0)
  INTO v_current_points;

  IF v_current_points <= 0 THEN
    RETURN json_build_object(
      'success', false,
      'error', 'NO_POINTS',
      'current', v_current_points,
      'requested', p_points_to_redeem
    );
  END IF;

  -- This redemption flow is designed as "redeem all points" (reset cycle).
  IF v_current_points <> p_points_to_redeem THEN
    RETURN json_build_object(
      'success', false,
      'error', 'POINTS_MISMATCH',
      'current', v_current_points,
      'requested', p_points_to_redeem
    );
  END IF;

  -- 3) New cycle id
  v_new_cycle_id := gen_random_uuid();

  -- 4) Map activity type to redemption transaction type
  v_transaction_type := CASE
    WHEN p_activity_type = 'activity_1' THEN 'redeem_activity_1'
    WHEN p_activity_type = 'activity_2' THEN 'redeem_activity_2'
    ELSE 'redeem_activity_2'
  END;

  -- 5) Upsert points_accounts (ensure row exists) + reset
  INSERT INTO points_accounts (
    member_code,
    phone,
    current_points,
    last_reset_time,
    current_cycle_id,
    last_updated
  ) VALUES (
    p_member_code,
    p_phone,
    0,
    now(),
    v_new_cycle_id,
    now()
  )
  ON CONFLICT (member_code)
  DO UPDATE SET
    phone = EXCLUDED.phone,
    current_points = 0,
    last_reset_time = EXCLUDED.last_reset_time,
    current_cycle_id = EXCLUDED.current_cycle_id,
    last_updated = EXCLUDED.last_updated;

  -- 6) Insert negative points ledger entry
  INSERT INTO points_ledger (
    member_code,
    member_id,
    phone_number,
    points_earned,
    transaction_type,
    status,
    currency,
    order_id,
    creator_id,
    creator_name,
    created_at
  ) VALUES (
    p_member_code,
    p_member_id,
    p_phone,
    -p_points_to_redeem,
    v_transaction_type,
    'issued',
    NULL,
    NULL,
    p_creator_id,
    p_creator_name,
    now()
  )
  RETURNING id INTO v_ledger_id;

  -- 7) Insert gift record
  INSERT INTO activity_gifts (
    member_id,
    phone_number,
    currency,
    amount,
    rate,
    fee,
    gift_value,
    gift_type,
    payment_agent,
    creator_id,
    created_at
  ) VALUES (
    p_member_id,
    p_phone,
    p_gift_currency,
    p_gift_amount,
    p_gift_rate,
    p_gift_fee,
    p_gift_value,
    p_activity_type,
    p_payment_agent,
    p_creator_id,
    now()
  )
  RETURNING id INTO v_gift_id;

  -- 8) Update member_activity (gift totals + profit) and reset time
  UPDATE member_activity
  SET
    total_gift_ngn = CASE WHEN p_gift_currency = 'NGN' THEN COALESCE(total_gift_ngn, 0) + p_gift_amount ELSE total_gift_ngn END,
    total_gift_ghs = CASE WHEN p_gift_currency = 'GHS' THEN COALESCE(total_gift_ghs, 0) + p_gift_amount ELSE total_gift_ghs END,
    total_gift_usdt = CASE WHEN p_gift_currency = 'USDT' THEN COALESCE(total_gift_usdt, 0) + p_gift_amount ELSE total_gift_usdt END,
    accumulated_profit = GREATEST(COALESCE(accumulated_profit, 0) - p_gift_value, 0),
    last_reset_time = now(),
    updated_at = now()
  WHERE member_id = p_member_id;

  RETURN json_build_object(
    'success', true,
    'ledger_id', v_ledger_id,
    'gift_id', v_gift_id,
    'new_cycle_id', v_new_cycle_id,
    'points_redeemed', p_points_to_redeem,
    'points_before', v_current_points
  );

EXCEPTION WHEN OTHERS THEN
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;