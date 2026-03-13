-- 1. 新会员默认密码设置触发器
--    当 members 表插入新行且 password_hash 为 NULL 时，自动设置初始密码 '123456'
CREATE OR REPLACE FUNCTION public.set_member_default_password()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.password_hash IS NULL OR NEW.password_hash = '' THEN
    NEW.password_hash := extensions.crypt('123456', extensions.gen_salt('bf'));
    NEW.initial_password_sent_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_default_password ON public.members;
CREATE TRIGGER trg_member_default_password
  BEFORE INSERT ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.set_member_default_password();

-- 2. 积分分类查询 RPC（供会员前端展示消费积分/推广积分/总积分）
CREATE OR REPLACE FUNCTION public.member_get_points_breakdown(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_code text;
  v_consumption  numeric := 0;
  v_referral     numeric := 0;
  v_total        numeric := 0;
BEGIN
  SELECT member_code INTO v_member_code FROM members WHERE id = p_member_id LIMIT 1;
  IF v_member_code IS NULL THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'MEMBER_NOT_FOUND',
      'consumption_points', 0, 'referral_points', 0, 'total_points', 0
    );
  END IF;

  -- 消费积分：自己消费产生（transaction_type = 'consumption'，正数，已发放）
  SELECT COALESCE(SUM(points_earned), 0) INTO v_consumption
  FROM points_ledger
  WHERE member_code = v_member_code
    AND transaction_type = 'consumption'
    AND status = 'issued'
    AND points_earned > 0;

  -- 推广积分：推广用户兑换产生（referral_1 / referral_2 / referral，正数，已发放）
  SELECT COALESCE(SUM(points_earned), 0) INTO v_referral
  FROM points_ledger
  WHERE member_code = v_member_code
    AND transaction_type IN ('referral_1', 'referral_2', 'referral')
    AND status = 'issued'
    AND points_earned > 0;

  v_total := v_consumption + v_referral;

  RETURN jsonb_build_object(
    'success', true,
    'consumption_points', v_consumption,
    'referral_points',    v_referral,
    'total_points',       v_total
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
