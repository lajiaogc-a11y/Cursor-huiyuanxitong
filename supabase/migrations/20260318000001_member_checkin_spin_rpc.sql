-- 会员签到与 Spin RPC

-- 每日签到 RPC：返回今日是否已签到、连续天数、奖励
CREATE OR REPLACE FUNCTION member_check_in(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := current_date;
  v_existing check_ins%ROWTYPE;
  v_yesterday date := current_date - 1;
  v_consecutive integer := 1;
  v_reward_type text := 'spin';
  v_reward_value numeric := 1;
BEGIN
  SELECT * INTO v_existing FROM check_ins
  WHERE member_id = p_member_id AND check_in_date = v_today
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'ALREADY_CHECKED_IN',
      'consecutive_days', v_existing.consecutive_days
    );
  END IF;
  SELECT consecutive_days INTO v_consecutive FROM check_ins
  WHERE member_id = p_member_id AND check_in_date = v_yesterday
  LIMIT 1;
  IF FOUND THEN
    v_consecutive := v_consecutive + 1;
  END IF;
  IF v_consecutive >= 7 THEN
    v_reward_value := 2;
  ELSIF v_consecutive >= 3 THEN
    v_reward_value := 1.5;
  END IF;
  INSERT INTO check_ins (member_id, check_in_date, consecutive_days, reward_type, reward_value)
  VALUES (p_member_id, v_today, v_consecutive, v_reward_type, v_reward_value);
  RETURN jsonb_build_object(
    'success', true,
    'consecutive_days', v_consecutive,
    'reward_type', v_reward_type,
    'reward_value', v_reward_value
  );
END;
$$;

-- Spin 抽奖 RPC：从奖品池随机抽取（简单等权）
CREATE OR REPLACE FUNCTION member_spin(p_member_id uuid, p_source text DEFAULT 'daily_free')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prize prizes%ROWTYPE;
  v_prizes prizes%ROWTYPE[];
  v_idx int;
  v_cnt int;
BEGIN
  SELECT array_agg(p ORDER BY p.name) INTO v_prizes FROM prizes p WHERE stock = -1 OR stock > 0;
  IF v_prizes IS NULL OR array_length(v_prizes, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_PRIZES');
  END IF;
  v_cnt := array_length(v_prizes, 1);
  v_idx := 1 + floor(random() * v_cnt)::int;
  v_prize := v_prizes[v_idx];
  INSERT INTO spins (member_id, spin_type, source, result, prize_id, status)
  VALUES (p_member_id, 'wheel', p_source, v_prize.name, v_prize.id, 'issued');
  IF v_prize.stock > 0 THEN
    UPDATE prizes SET stock = stock - 1 WHERE id = v_prize.id;
  END IF;
  -- stock = -1 means unlimited, no update
  RETURN jsonb_build_object(
    'success', true,
    'prize', jsonb_build_object(
      'id', v_prize.id,
      'name', v_prize.name,
      'type', v_prize.type
    )
  );
END;
$$;
