-- 会员积分商城兑换 RPC

CREATE OR REPLACE FUNCTION member_redeem_prize(p_member_id uuid, p_prize_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member members%ROWTYPE;
  v_prize prizes%ROWTYPE;
  v_points numeric := 0;
  v_member_code text;
  v_phone text;
  v_activity_id uuid;
BEGIN
  SELECT * INTO v_member FROM members WHERE id = p_member_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'MEMBER_NOT_FOUND');
  END IF;
  v_member_code := v_member.member_code;
  v_phone := v_member.phone_number;

  SELECT * INTO v_prize FROM prizes WHERE id = p_prize_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'PRIZE_NOT_FOUND');
  END IF;
  IF v_prize.stock = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'OUT_OF_STOCK');
  END IF;
  IF v_prize.points_required <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_PRIZE');
  END IF;

  -- 获取会员当前积分：优先 points_accounts，否则 member_activity
  SELECT current_points INTO v_points FROM points_accounts
  WHERE member_code = v_member_code LIMIT 1;
  IF v_points IS NULL THEN
    SELECT remaining_points, id INTO v_points, v_activity_id FROM member_activity
    WHERE member_id = p_member_id LIMIT 1;
    IF v_points IS NULL THEN
      v_points := 0;
    END IF;
  END IF;

  IF v_points < v_prize.points_required THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_POINTS',
      'required', v_prize.points_required,
      'current', v_points
    );
  END IF;

  -- 1. 插入积分流水（负积分）
  INSERT INTO points_ledger (
    member_code, phone_number, member_id,
    transaction_type, points_earned, status
  ) VALUES (
    v_member_code, v_phone, p_member_id,
    'points_mall', -(v_prize.points_required)::integer, 'issued'
  );

  -- 2. 扣减 member_activity.remaining_points
  UPDATE member_activity SET
    remaining_points = GREATEST(0, (remaining_points - v_prize.points_required)),
    accumulated_points = GREATEST(0, (accumulated_points - v_prize.points_required)),
    updated_at = now()
  WHERE member_id = p_member_id;

  -- 3. 扣减 points_accounts（如存在）
  UPDATE points_accounts SET
    current_points = GREATEST(0, (COALESCE(current_points, 0) - v_prize.points_required)),
    last_updated = now()
  WHERE member_code = v_member_code;

  -- 4. 创建兑奖记录
  INSERT INTO redemptions (member_id, prize_id, status)
  VALUES (
    p_member_id,
    p_prize_id,
    CASE WHEN v_prize.auto_issue THEN 'issued' ELSE 'pending' END
  );

  -- 5. 扣减奖品库存（非无限时）
  IF v_prize.stock > 0 THEN
    UPDATE prizes SET stock = stock - 1 WHERE id = p_prize_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'points_used', v_prize.points_required,
    'prize', jsonb_build_object(
      'id', v_prize.id,
      'name', v_prize.name,
      'type', v_prize.type
    ),
    'status', CASE WHEN v_prize.auto_issue THEN 'issued' ELSE 'pending' END
  );
END;
$$;
