-- 会员端 RPC：获取积分、抽奖次数（绕过 RLS，供匿名/会员前端使用）

-- 1. 获取会员当前积分
CREATE OR REPLACE FUNCTION public.member_get_points(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_code text;
  v_points numeric := 0;
BEGIN
  SELECT member_code INTO v_member_code FROM members WHERE id = p_member_id LIMIT 1;
  IF v_member_code IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'MEMBER_NOT_FOUND', 'points', 0);
  END IF;

  -- 优先 points_accounts，否则 member_activity
  SELECT current_points INTO v_points FROM points_accounts WHERE member_code = v_member_code LIMIT 1;
  IF v_points IS NULL THEN
    SELECT remaining_points INTO v_points FROM member_activity WHERE member_id = p_member_id LIMIT 1;
    IF v_points IS NULL THEN
      v_points := 0;
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true, 'points', COALESCE(v_points, 0));
END;
$$;

-- 2. 获取会员剩余抽奖次数（签到奖励累计 - 已使用）
CREATE OR REPLACE FUNCTION public.member_get_spin_quota(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_earned numeric := 0;
  v_used bigint := 0;
  v_remaining int;
BEGIN
  -- 累计签到奖励（reward_value 为抽奖次数）
  SELECT COALESCE(SUM(reward_value), 0) INTO v_earned
  FROM check_ins
  WHERE member_id = p_member_id AND reward_type = 'spin';

  -- 已使用的抽奖次数
  SELECT COUNT(*) INTO v_used FROM spins WHERE member_id = p_member_id;

  v_remaining := GREATEST(0, (v_earned::bigint - v_used)::int);

  RETURN jsonb_build_object(
    'success', true,
    'remaining', v_remaining,
    'earned', v_earned,
    'used', v_used
  );
END;
$$;

-- 3. 获取会员抽奖记录（绕过 RLS）
CREATE OR REPLACE FUNCTION public.member_get_spins(p_member_id uuid, p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', s.id,
      'result', s.result,
      'source', s.source,
      'created_at', s.created_at
    )
  ), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT id, result, source, created_at
    FROM spins
    WHERE member_id = p_member_id
    ORDER BY created_at DESC
    LIMIT p_limit
  ) s;
  RETURN jsonb_build_object('success', true, 'spins', v_rows);
END;
$$;

-- 4. 检查今日是否已签到（绕过 RLS）
CREATE OR REPLACE FUNCTION public.member_check_in_today(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM check_ins
    WHERE member_id = p_member_id AND check_in_date = current_date
  ) INTO v_exists;
  RETURN jsonb_build_object('success', true, 'checked_in_today', v_exists);
END;
$$;
