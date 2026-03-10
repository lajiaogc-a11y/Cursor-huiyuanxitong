-- 1. 先删除现有的 CHECK 约束（如果存在）
ALTER TABLE public.points_ledger DROP CONSTRAINT IF EXISTS points_ledger_transaction_type_check;

-- 2. 添加新的 CHECK 约束，包含兑换类型
ALTER TABLE public.points_ledger ADD CONSTRAINT points_ledger_transaction_type_check 
CHECK (transaction_type IN ('consumption', 'referral_1', 'referral_2', 'exchange', 'reversal', 'adjustment', 'redemption', 'redeem_activity_1', 'redeem_activity_2'));

-- 3. 替换验证触发器函数，允许兑换类型使用负积分
CREATE OR REPLACE FUNCTION public.validate_points_ledger_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  -- 兑换类型允许 issued + 负积分
  IF NEW.transaction_type IN ('redemption', 'redeem_activity_1', 'redeem_activity_2') THEN
    -- 兑换必须是负积分
    IF NEW.points_earned > 0 THEN
      RAISE EXCEPTION 'Redemption transactions must have negative points_earned value';
    END IF;
    RETURN NEW;
  END IF;

  -- 其他类型：issued 必须正数，reversed 必须负数
  IF NEW.status = 'issued' AND NEW.points_earned < 0 THEN
    RAISE EXCEPTION 'Points with status "issued" must have positive points_earned value (except redemptions)';
  END IF;
  
  IF NEW.status = 'reversed' AND NEW.points_earned > 0 THEN
    RAISE EXCEPTION 'Points with status "reversed" must have negative points_earned value';
  END IF;
  
  RETURN NEW;
END;
$function$;

-- 4. 创建兑换积分的事务性 RPC 函数
CREATE OR REPLACE FUNCTION public.redeem_points_and_record(
  p_member_code TEXT,
  p_phone TEXT,
  p_member_id UUID,
  p_points_to_redeem INTEGER,
  p_activity_type TEXT,
  p_gift_currency TEXT,
  p_gift_amount NUMERIC,
  p_gift_rate NUMERIC,
  p_gift_fee NUMERIC,
  p_gift_value NUMERIC,
  p_payment_agent TEXT,
  p_creator_id UUID,
  p_creator_name TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_current_points INTEGER;
  v_new_cycle_id UUID;
  v_gift_id UUID;
  v_ledger_id UUID;
  v_transaction_type TEXT;
  v_result JSON;
BEGIN
  -- 1. 验证积分
  SELECT COALESCE(current_points, 0) INTO v_current_points
  FROM points_accounts
  WHERE member_code = p_member_code;
  
  IF v_current_points IS NULL OR v_current_points <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'NO_POINTS');
  END IF;
  
  IF v_current_points <> p_points_to_redeem THEN
    RETURN json_build_object('success', false, 'error', 'POINTS_MISMATCH', 'current', v_current_points, 'requested', p_points_to_redeem);
  END IF;
  
  -- 2. 生成新的周期ID
  v_new_cycle_id := gen_random_uuid();
  
  -- 确定交易类型
  v_transaction_type := CASE 
    WHEN p_activity_type = 'activity_1' THEN 'redeem_activity_1'
    ELSE 'redeem_activity_2'
  END;
  
  -- 3. 更新 points_accounts（清零积分、设置重置时间、换周期ID）
  UPDATE points_accounts
  SET 
    current_points = 0,
    last_reset_time = now(),
    current_cycle_id = v_new_cycle_id,
    last_updated = now()
  WHERE member_code = p_member_code;
  
  -- 4. 插入积分流水（负积分记录）
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
    -p_points_to_redeem,  -- 负积分
    v_transaction_type,
    'issued',
    NULL,  -- 兑换记录币种为空
    NULL,  -- 兑换记录订单ID为空
    p_creator_id,
    p_creator_name,
    now()
  )
  RETURNING id INTO v_ledger_id;
  
  -- 5. 插入赠送记录
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
  
  -- 6. 更新 member_activity（累计赠送、扣减累计利润）
  UPDATE member_activity
  SET 
    total_gift_ngn = CASE WHEN p_gift_currency = 'NGN' THEN COALESCE(total_gift_ngn, 0) + p_gift_amount ELSE total_gift_ngn END,
    total_gift_ghs = CASE WHEN p_gift_currency = 'GHS' THEN COALESCE(total_gift_ghs, 0) + p_gift_amount ELSE total_gift_ghs END,
    total_gift_usdt = CASE WHEN p_gift_currency = 'USDT' THEN COALESCE(total_gift_usdt, 0) + p_gift_amount ELSE total_gift_usdt END,
    accumulated_profit = GREATEST(COALESCE(accumulated_profit, 0) - p_gift_value, 0),
    last_reset_time = now(),
    updated_at = now()
  WHERE member_id = p_member_id;
  
  -- 7. 返回成功结果
  RETURN json_build_object(
    'success', true,
    'ledger_id', v_ledger_id,
    'gift_id', v_gift_id,
    'new_cycle_id', v_new_cycle_id,
    'points_redeemed', p_points_to_redeem
  );
  
EXCEPTION WHEN OTHERS THEN
  -- 任何错误都会导致整个事务回滚
  RETURN json_build_object('success', false, 'error', SQLERRM);
END;
$function$;