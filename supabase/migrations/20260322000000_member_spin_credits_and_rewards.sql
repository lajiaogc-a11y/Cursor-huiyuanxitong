-- 会员抽奖积分扩展：支持邀请奖励、WhatsApp 分享奖励
-- 1. spin_credits 表：存储非签到获得的抽奖次数（邀请、分享等）
-- 2. 更新 member_get_spin_quota 包含 spin_credits
-- 3. member_grant_spin_for_share：分享到 WhatsApp 得 1 次（每日限 1 次）
-- 4. grant_invite_bonus_spins：邀请奖励，双方各得 3 次（管理员创建被邀请人后调用）

-- 1. spin_credits 表
CREATE TABLE IF NOT EXISTS public.spin_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  credits integer NOT NULL DEFAULT 1,
  source text NOT NULL,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spin_credits_member ON public.spin_credits(member_id);
CREATE INDEX IF NOT EXISTS idx_spin_credits_source ON public.spin_credits(source);
COMMENT ON TABLE public.spin_credits IS '抽奖次数奖励：邀请、分享等非签到来源';

ALTER TABLE IF EXISTS public.spin_credits ENABLE ROW LEVEL SECURITY;
-- spin_credits 仅通过 RPC 访问，无需策略

-- 2. 更新 member_get_spin_quota 包含 spin_credits
CREATE OR REPLACE FUNCTION public.member_get_spin_quota(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_earned numeric := 0;
  v_credits int := 0;
  v_used bigint := 0;
  v_remaining int;
BEGIN
  -- 签到获得的抽奖次数
  SELECT COALESCE(SUM(reward_value), 0) INTO v_earned
  FROM check_ins
  WHERE member_id = p_member_id AND reward_type = 'spin';

  -- spin_credits 奖励（邀请、分享等）
  SELECT COALESCE(SUM(credits), 0)::int INTO v_credits
  FROM spin_credits
  WHERE member_id = p_member_id;

  -- 已使用的抽奖次数
  SELECT COUNT(*) INTO v_used FROM spins WHERE member_id = p_member_id;

  v_remaining := GREATEST(0, ((v_earned + v_credits)::bigint - v_used)::int);

  RETURN jsonb_build_object(
    'success', true,
    'remaining', v_remaining,
    'earned', v_earned + v_credits,
    'used', v_used
  );
END;
$$;

-- 3. 更新 member_spin 校验逻辑以包含 spin_credits
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
  v_credits int := 0;
  v_used bigint := 0;
  v_remaining int;
BEGIN
  -- 签到获得的抽奖次数
  SELECT COALESCE(SUM(reward_value), 0) INTO v_earned
  FROM check_ins
  WHERE member_id = p_member_id AND reward_type = 'spin';

  -- spin_credits 奖励
  SELECT COALESCE(SUM(credits), 0)::int INTO v_credits
  FROM spin_credits
  WHERE member_id = p_member_id;

  SELECT COUNT(*) INTO v_used FROM spins WHERE member_id = p_member_id;
  v_remaining := GREATEST(0, ((v_earned + v_credits)::bigint - v_used)::int);

  IF v_remaining <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_SPIN_QUOTA', 'remaining', 0);
  END IF;

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

-- 4. 分享到 WhatsApp 得 1 次抽奖（每日限 1 次）
CREATE OR REPLACE FUNCTION public.member_grant_spin_for_share(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF p_member_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_MEMBER');
  END IF;

  -- 今日是否已领取过
  SELECT EXISTS(
    SELECT 1 FROM spin_credits
    WHERE member_id = p_member_id
      AND source = 'whatsapp_share'
      AND created_at::date = current_date
  ) INTO v_exists;

  IF v_exists THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_CLAIMED_TODAY');
  END IF;

  INSERT INTO spin_credits (member_id, credits, source)
  VALUES (p_member_id, 1, 'whatsapp_share');

  RETURN jsonb_build_object('success', true, 'message', 'Got 1 spin for sharing!');
END;
$$;

-- 5. 邀请奖励：双方各得 3 次抽奖（管理员创建被邀请人后调用）
CREATE OR REPLACE FUNCTION public.grant_invite_bonus_spins(p_inviter_id uuid, p_invitee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_inviter_id IS NULL OR p_invitee_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
  END IF;

  INSERT INTO spin_credits (member_id, credits, source)
  VALUES (p_inviter_id, 3, 'invite_inviter'),
         (p_invitee_id, 3, 'invite_invitee');

  RETURN jsonb_build_object('success', true, 'message', 'Invite bonus granted');
END;
$$;

-- 6. 邀请提交时立即给邀请人 3 次（简化流程：被邀请人提交即给邀请人奖励）
-- 被邀请人需管理员创建会员后手动调用 grant_invite_bonus_spins 给其 3 次
-- 或：在 validate_invite_and_submit 成功后给邀请人 3 次
CREATE OR REPLACE FUNCTION validate_invite_and_submit(p_code text, p_invitee_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inviter_id uuid;
BEGIN
  IF trim(p_code) = '' OR trim(p_invitee_phone) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
  END IF;

  SELECT id INTO v_inviter_id FROM members WHERE member_code = trim(p_code) LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CODE');
  END IF;

  -- 防止重复邀请同一人
  IF EXISTS (SELECT 1 FROM member_invites WHERE inviter_id = v_inviter_id AND invitee_phone = trim(p_invitee_phone)) THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_INVITED');
  END IF;

  -- invite_code 需唯一，使用 code+随机后缀
  INSERT INTO member_invites (inviter_id, invitee_phone, invite_code, status)
  VALUES (v_inviter_id, trim(p_invitee_phone), trim(p_code) || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), 'pending');

  -- 邀请人立即获得 3 次抽奖（每成功邀请 1 人得 3 次）
  INSERT INTO spin_credits (member_id, credits, source)
  VALUES (v_inviter_id, 3, 'invite_inviter');

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_REGISTERED');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 6b. 被邀请人成为会员时获得 3 次（需在 admin_set_member_initial_password 之前定义）
CREATE OR REPLACE FUNCTION public.grant_invitee_spins(p_member_id uuid, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite_id uuid;
BEGIN
  IF p_member_id IS NULL OR trim(p_phone) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
  END IF;

  -- 查找该手机号是否在 member_invites 中（被邀请人）
  SELECT id INTO v_invite_id FROM member_invites
  WHERE invitee_phone = trim(p_phone) AND status = 'pending'
  ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'granted', false);
  END IF;

  -- 更新状态为已接受
  UPDATE member_invites SET status = 'accepted' WHERE id = v_invite_id;

  -- 给被邀请人 3 次抽奖
  INSERT INTO spin_credits (member_id, credits, source)
  VALUES (p_member_id, 3, 'invite_invitee');

  RETURN jsonb_build_object('success', true, 'granted', true);
END;
$$;

-- 7. 更新 admin_set_member_initial_password：设置密码时若为被邀请人则自动发放 3 次抽奖
CREATE OR REPLACE FUNCTION public.admin_set_member_initial_password(p_member_id uuid, p_new_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phone text;
BEGIN
  IF length(trim(p_new_password)) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'PASSWORD_TOO_SHORT');
  END IF;
  SELECT phone_number INTO v_phone FROM members WHERE id = p_member_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'MEMBER_NOT_FOUND');
  END IF;
  UPDATE members SET
    password_hash = extensions.crypt(trim(p_new_password), extensions.gen_salt('bf')),
    initial_password_sent_at = now(),
    updated_at = now()
  WHERE id = p_member_id;
  PERFORM grant_invitee_spins(p_member_id, v_phone);
  RETURN jsonb_build_object('success', true);
END;
$$;
