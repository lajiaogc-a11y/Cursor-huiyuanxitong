-- 修改 member_spin：校验并扣减抽奖次数

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
  v_earned numeric := 0;
  v_used bigint := 0;
  v_remaining int;
BEGIN
  -- 校验剩余抽奖次数
  SELECT COALESCE(SUM(reward_value), 0) INTO v_earned
  FROM check_ins
  WHERE member_id = p_member_id AND reward_type = 'spin';

  SELECT COUNT(*) INTO v_used FROM spins WHERE member_id = p_member_id;
  v_remaining := GREATEST(0, (v_earned::bigint - v_used)::int);

  IF v_remaining <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_SPIN_QUOTA', 'remaining', 0);
  END IF;

  -- 抽奖逻辑
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

  RETURN jsonb_build_object(
    'success', true,
    'remaining', v_remaining - 1,
    'prize', jsonb_build_object(
      'id', v_prize.id,
      'name', v_prize.name,
      'type', v_prize.type
    )
  );
END;
$$;
