-- 会员系统高级活动配置（按租户）
-- - 可配置签到奖励、分享奖励、邀请奖励
-- - 会员功能开关在后端生效（防止仅前端隐藏被绕过）
-- - 可配置登录页徽章与底部文案

ALTER TABLE public.member_portal_settings
  ADD COLUMN IF NOT EXISTS checkin_reward_base numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS checkin_reward_streak_3 numeric NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS checkin_reward_streak_7 numeric NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS share_reward_spins integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS invite_reward_spins integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS login_badges jsonb NOT NULL DEFAULT '["🏆 签到奖励","🎁 积分兑换","👥 邀请好友"]'::jsonb,
  ADD COLUMN IF NOT EXISTS footer_text text NOT NULL DEFAULT '账户数据安全加密，平台合规运营，请放心使用';

CREATE OR REPLACE FUNCTION public.member_resolve_tenant_id(p_member_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT COALESCE(ec.tenant_id, er.tenant_id)
    INTO v_tenant_id
  FROM public.members m
  LEFT JOIN public.employees ec ON ec.id = m.creator_id
  LEFT JOIN public.employees er ON er.id = m.recorder_id
  WHERE m.id = p_member_id
  LIMIT 1;
  RETURN v_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_member_portal_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
  v_tenant_id uuid;
  v_tenant_name text;
  v_row public.member_portal_settings%ROWTYPE;
BEGIN
  v_employee_id := public.resolve_current_employee_id();
  IF v_employee_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  END IF;

  SELECT e.tenant_id INTO v_tenant_id
  FROM public.employees e
  WHERE e.id = v_employee_id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'TENANT_NOT_FOUND');
  END IF;

  SELECT t.tenant_name INTO v_tenant_name FROM public.tenants t WHERE t.id = v_tenant_id LIMIT 1;
  SELECT * INTO v_row FROM public.member_portal_settings s WHERE s.tenant_id = v_tenant_id LIMIT 1;

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'tenant_name', COALESCE(v_tenant_name, ''),
    'settings', jsonb_build_object(
      'company_name', COALESCE(v_row.company_name, 'Spin & Win'),
      'logo_url', v_row.logo_url,
      'theme_primary_color', COALESCE(v_row.theme_primary_color, '#f59e0b'),
      'welcome_title', COALESCE(v_row.welcome_title, 'Premium Member Platform'),
      'welcome_subtitle', COALESCE(v_row.welcome_subtitle, 'Sign in to your member account'),
      'announcement', v_row.announcement,
      'enable_spin', COALESCE(v_row.enable_spin, true),
      'enable_invite', COALESCE(v_row.enable_invite, true),
      'enable_check_in', COALESCE(v_row.enable_check_in, true),
      'enable_share_reward', COALESCE(v_row.enable_share_reward, true),
      'checkin_reward_base', COALESCE(v_row.checkin_reward_base, 1),
      'checkin_reward_streak_3', COALESCE(v_row.checkin_reward_streak_3, 1.5),
      'checkin_reward_streak_7', COALESCE(v_row.checkin_reward_streak_7, 2),
      'share_reward_spins', COALESCE(v_row.share_reward_spins, 1),
      'invite_reward_spins', COALESCE(v_row.invite_reward_spins, 3),
      'login_badges', COALESCE(v_row.login_badges, '["🏆 签到奖励","🎁 积分兑换","👥 邀请好友"]'::jsonb),
      'footer_text', COALESCE(v_row.footer_text, '账户数据安全加密，平台合规运营，请放心使用')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_my_member_portal_settings(
  p_company_name text,
  p_logo_url text,
  p_theme_primary_color text,
  p_welcome_title text,
  p_welcome_subtitle text,
  p_announcement text,
  p_enable_spin boolean,
  p_enable_invite boolean,
  p_enable_check_in boolean,
  p_enable_share_reward boolean,
  p_checkin_reward_base numeric,
  p_checkin_reward_streak_3 numeric,
  p_checkin_reward_streak_7 numeric,
  p_share_reward_spins integer,
  p_invite_reward_spins integer,
  p_login_badges jsonb,
  p_footer_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
  v_tenant_id uuid;
  v_role text;
  v_is_super_admin boolean;
BEGIN
  v_employee_id := public.resolve_current_employee_id();
  IF v_employee_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  END IF;

  SELECT e.tenant_id, e.role, COALESCE(e.is_super_admin, false)
    INTO v_tenant_id, v_role, v_is_super_admin
  FROM public.employees e
  WHERE e.id = v_employee_id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'TENANT_NOT_FOUND');
  END IF;

  IF v_role <> 'admin' AND NOT v_is_super_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_PERMISSION');
  END IF;

  INSERT INTO public.member_portal_settings (
    tenant_id, company_name, logo_url, theme_primary_color,
    welcome_title, welcome_subtitle, announcement,
    enable_spin, enable_invite, enable_check_in, enable_share_reward,
    checkin_reward_base, checkin_reward_streak_3, checkin_reward_streak_7,
    share_reward_spins, invite_reward_spins, login_badges, footer_text, updated_by
  ) VALUES (
    v_tenant_id,
    COALESCE(NULLIF(trim(p_company_name), ''), 'Spin & Win'),
    NULLIF(trim(COALESCE(p_logo_url, '')), ''),
    COALESCE(NULLIF(trim(p_theme_primary_color), ''), '#f59e0b'),
    COALESCE(NULLIF(trim(p_welcome_title), ''), 'Premium Member Platform'),
    COALESCE(NULLIF(trim(p_welcome_subtitle), ''), 'Sign in to your member account'),
    NULLIF(trim(COALESCE(p_announcement, '')), ''),
    COALESCE(p_enable_spin, true),
    COALESCE(p_enable_invite, true),
    COALESCE(p_enable_check_in, true),
    COALESCE(p_enable_share_reward, true),
    GREATEST(COALESCE(p_checkin_reward_base, 1), 0),
    GREATEST(COALESCE(p_checkin_reward_streak_3, 1.5), 0),
    GREATEST(COALESCE(p_checkin_reward_streak_7, 2), 0),
    GREATEST(COALESCE(p_share_reward_spins, 1), 0),
    GREATEST(COALESCE(p_invite_reward_spins, 3), 0),
    COALESCE(p_login_badges, '["🏆 签到奖励","🎁 积分兑换","👥 邀请好友"]'::jsonb),
    COALESCE(NULLIF(trim(COALESCE(p_footer_text, '')), ''), '账户数据安全加密，平台合规运营，请放心使用'),
    v_employee_id
  )
  ON CONFLICT (tenant_id) DO UPDATE
  SET
    company_name = EXCLUDED.company_name,
    logo_url = EXCLUDED.logo_url,
    theme_primary_color = EXCLUDED.theme_primary_color,
    welcome_title = EXCLUDED.welcome_title,
    welcome_subtitle = EXCLUDED.welcome_subtitle,
    announcement = EXCLUDED.announcement,
    enable_spin = EXCLUDED.enable_spin,
    enable_invite = EXCLUDED.enable_invite,
    enable_check_in = EXCLUDED.enable_check_in,
    enable_share_reward = EXCLUDED.enable_share_reward,
    checkin_reward_base = EXCLUDED.checkin_reward_base,
    checkin_reward_streak_3 = EXCLUDED.checkin_reward_streak_3,
    checkin_reward_streak_7 = EXCLUDED.checkin_reward_streak_7,
    share_reward_spins = EXCLUDED.share_reward_spins,
    invite_reward_spins = EXCLUDED.invite_reward_spins,
    login_badges = EXCLUDED.login_badges,
    footer_text = EXCLUDED.footer_text,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.member_get_portal_settings(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_tenant_name text;
  v_row public.member_portal_settings%ROWTYPE;
BEGIN
  v_tenant_id := public.member_resolve_tenant_id(p_member_id);

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'tenant_id', null,
      'tenant_name', '',
      'settings', jsonb_build_object(
        'company_name', 'Spin & Win',
        'logo_url', null,
        'theme_primary_color', '#f59e0b',
        'welcome_title', 'Premium Member Platform',
        'welcome_subtitle', 'Sign in to your member account',
        'announcement', null,
        'enable_spin', true,
        'enable_invite', true,
        'enable_check_in', true,
        'enable_share_reward', true,
        'checkin_reward_base', 1,
        'checkin_reward_streak_3', 1.5,
        'checkin_reward_streak_7', 2,
        'share_reward_spins', 1,
        'invite_reward_spins', 3,
        'login_badges', '["🏆 签到奖励","🎁 积分兑换","👥 邀请好友"]'::jsonb,
        'footer_text', '账户数据安全加密，平台合规运营，请放心使用'
      )
    );
  END IF;

  SELECT t.tenant_name INTO v_tenant_name FROM public.tenants t WHERE t.id = v_tenant_id LIMIT 1;
  SELECT * INTO v_row FROM public.member_portal_settings s WHERE s.tenant_id = v_tenant_id LIMIT 1;

  RETURN jsonb_build_object(
    'success', true,
    'tenant_id', v_tenant_id,
    'tenant_name', COALESCE(v_tenant_name, ''),
    'settings', jsonb_build_object(
      'company_name', COALESCE(v_row.company_name, 'Spin & Win'),
      'logo_url', v_row.logo_url,
      'theme_primary_color', COALESCE(v_row.theme_primary_color, '#f59e0b'),
      'welcome_title', COALESCE(v_row.welcome_title, 'Premium Member Platform'),
      'welcome_subtitle', COALESCE(v_row.welcome_subtitle, 'Sign in to your member account'),
      'announcement', v_row.announcement,
      'enable_spin', COALESCE(v_row.enable_spin, true),
      'enable_invite', COALESCE(v_row.enable_invite, true),
      'enable_check_in', COALESCE(v_row.enable_check_in, true),
      'enable_share_reward', COALESCE(v_row.enable_share_reward, true),
      'checkin_reward_base', COALESCE(v_row.checkin_reward_base, 1),
      'checkin_reward_streak_3', COALESCE(v_row.checkin_reward_streak_3, 1.5),
      'checkin_reward_streak_7', COALESCE(v_row.checkin_reward_streak_7, 2),
      'share_reward_spins', COALESCE(v_row.share_reward_spins, 1),
      'invite_reward_spins', COALESCE(v_row.invite_reward_spins, 3),
      'login_badges', COALESCE(v_row.login_badges, '["🏆 签到奖励","🎁 积分兑换","👥 邀请好友"]'::jsonb),
      'footer_text', COALESCE(v_row.footer_text, '账户数据安全加密，平台合规运营，请放心使用')
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.member_get_portal_settings_by_invite_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id uuid;
BEGIN
  SELECT m.id INTO v_member_id
  FROM public.members m
  WHERE m.member_code = trim(COALESCE(p_code, ''))
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CODE');
  END IF;

  RETURN public.member_get_portal_settings(v_member_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.member_check_in(p_member_id uuid)
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
  v_tenant_id uuid;
  v_settings public.member_portal_settings%ROWTYPE;
BEGIN
  v_tenant_id := public.member_resolve_tenant_id(p_member_id);
  IF v_tenant_id IS NOT NULL THEN
    SELECT * INTO v_settings FROM public.member_portal_settings WHERE tenant_id = v_tenant_id LIMIT 1;
    IF COALESCE(v_settings.enable_check_in, true) = false THEN
      RETURN jsonb_build_object('success', false, 'error', 'CHECK_IN_DISABLED');
    END IF;
  END IF;

  SELECT * INTO v_existing FROM check_ins
  WHERE member_id = p_member_id AND check_in_date = v_today
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_CHECKED_IN', 'consecutive_days', v_existing.consecutive_days);
  END IF;

  SELECT consecutive_days INTO v_consecutive FROM check_ins
  WHERE member_id = p_member_id AND check_in_date = v_yesterday
  LIMIT 1;
  IF FOUND THEN
    v_consecutive := v_consecutive + 1;
  END IF;

  v_reward_value := COALESCE(v_settings.checkin_reward_base, 1);
  IF v_consecutive >= 7 THEN
    v_reward_value := COALESCE(v_settings.checkin_reward_streak_7, 2);
  ELSIF v_consecutive >= 3 THEN
    v_reward_value := COALESCE(v_settings.checkin_reward_streak_3, 1.5);
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

CREATE OR REPLACE FUNCTION public.member_grant_spin_for_share(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exists boolean;
  v_tenant_id uuid;
  v_settings public.member_portal_settings%ROWTYPE;
  v_credits int := 1;
BEGIN
  IF p_member_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_MEMBER');
  END IF;

  v_tenant_id := public.member_resolve_tenant_id(p_member_id);
  IF v_tenant_id IS NOT NULL THEN
    SELECT * INTO v_settings FROM public.member_portal_settings WHERE tenant_id = v_tenant_id LIMIT 1;
    IF COALESCE(v_settings.enable_share_reward, true) = false THEN
      RETURN jsonb_build_object('success', false, 'error', 'SHARE_REWARD_DISABLED');
    END IF;
    v_credits := GREATEST(COALESCE(v_settings.share_reward_spins, 1), 0);
  END IF;

  IF v_credits <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'SHARE_REWARD_DISABLED');
  END IF;

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
  VALUES (p_member_id, v_credits, 'whatsapp_share');

  RETURN jsonb_build_object('success', true, 'credits', v_credits, 'message', 'Share reward granted');
END;
$$;

CREATE OR REPLACE FUNCTION public.member_spin(p_member_id uuid, p_source text DEFAULT 'daily_free')
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
  v_tenant_id uuid;
  v_settings public.member_portal_settings%ROWTYPE;
BEGIN
  v_tenant_id := public.member_resolve_tenant_id(p_member_id);
  IF v_tenant_id IS NOT NULL THEN
    SELECT * INTO v_settings FROM public.member_portal_settings WHERE tenant_id = v_tenant_id LIMIT 1;
    IF COALESCE(v_settings.enable_spin, true) = false THEN
      RETURN jsonb_build_object('success', false, 'error', 'SPIN_DISABLED');
    END IF;
  END IF;

  SELECT COALESCE(SUM(reward_value), 0) INTO v_earned
  FROM check_ins
  WHERE member_id = p_member_id AND reward_type = 'spin';

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
    'prize', jsonb_build_object('id', v_prize.id, 'name', v_prize.name, 'type', v_prize.type)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_invite_and_submit(p_code text, p_invitee_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inviter_id uuid;
  v_tenant_id uuid;
  v_settings public.member_portal_settings%ROWTYPE;
  v_reward int := 3;
BEGIN
  IF trim(COALESCE(p_code, '')) = '' OR trim(COALESCE(p_invitee_phone, '')) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
  END IF;

  SELECT id INTO v_inviter_id FROM members WHERE member_code = trim(p_code) LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CODE');
  END IF;

  v_tenant_id := public.member_resolve_tenant_id(v_inviter_id);
  IF v_tenant_id IS NOT NULL THEN
    SELECT * INTO v_settings FROM public.member_portal_settings WHERE tenant_id = v_tenant_id LIMIT 1;
    IF COALESCE(v_settings.enable_invite, true) = false THEN
      RETURN jsonb_build_object('success', false, 'error', 'INVITE_DISABLED');
    END IF;
    v_reward := GREATEST(COALESCE(v_settings.invite_reward_spins, 3), 0);
  END IF;

  IF EXISTS (
    SELECT 1 FROM member_invites
    WHERE inviter_id = v_inviter_id AND invitee_phone = trim(p_invitee_phone)
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_INVITED');
  END IF;

  INSERT INTO member_invites (inviter_id, invitee_phone, invite_code, status)
  VALUES (v_inviter_id, trim(p_invitee_phone), trim(p_code) || '_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), 'pending');

  IF v_reward > 0 THEN
    INSERT INTO spin_credits (member_id, credits, source)
    VALUES (v_inviter_id, v_reward, 'invite_inviter');
  END IF;

  RETURN jsonb_build_object('success', true, 'reward_spins', v_reward);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_REGISTERED');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_invitee_spins(p_member_id uuid, p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invite_id uuid;
  v_inviter_id uuid;
  v_tenant_id uuid;
  v_settings public.member_portal_settings%ROWTYPE;
  v_reward int := 3;
BEGIN
  IF p_member_id IS NULL OR trim(COALESCE(p_phone, '')) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
  END IF;

  SELECT id, inviter_id INTO v_invite_id, v_inviter_id
  FROM member_invites
  WHERE invitee_phone = trim(p_phone) AND status = 'pending'
  ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'granted', false);
  END IF;

  v_tenant_id := public.member_resolve_tenant_id(v_inviter_id);
  IF v_tenant_id IS NOT NULL THEN
    SELECT * INTO v_settings FROM public.member_portal_settings WHERE tenant_id = v_tenant_id LIMIT 1;
    v_reward := GREATEST(COALESCE(v_settings.invite_reward_spins, 3), 0);
  END IF;

  UPDATE member_invites SET status = 'accepted' WHERE id = v_invite_id;

  IF v_reward > 0 THEN
    INSERT INTO spin_credits (member_id, credits, source)
    VALUES (p_member_id, v_reward, 'invite_invitee');
  END IF;

  RETURN jsonb_build_object('success', true, 'granted', true, 'reward_spins', v_reward);
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_invite_bonus_spins(p_inviter_id uuid, p_invitee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_settings public.member_portal_settings%ROWTYPE;
  v_reward int := 3;
BEGIN
  IF p_inviter_id IS NULL OR p_invitee_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
  END IF;

  v_tenant_id := public.member_resolve_tenant_id(p_inviter_id);
  IF v_tenant_id IS NOT NULL THEN
    SELECT * INTO v_settings FROM public.member_portal_settings WHERE tenant_id = v_tenant_id LIMIT 1;
    v_reward := GREATEST(COALESCE(v_settings.invite_reward_spins, 3), 0);
  END IF;

  IF v_reward > 0 THEN
    INSERT INTO spin_credits (member_id, credits, source)
    VALUES (p_inviter_id, v_reward, 'invite_inviter'),
           (p_invitee_id, v_reward, 'invite_invitee');
  END IF;

  RETURN jsonb_build_object('success', true, 'reward_spins', v_reward);
END;
$$;

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

  -- 若该会员为被邀请人，则按租户配置发放被邀请奖励
  PERFORM public.grant_invitee_spins(p_member_id, v_phone);

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.member_resolve_tenant_id(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_get_portal_settings_by_invite_code(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_my_member_portal_settings(text, text, text, text, text, text, boolean, boolean, boolean, boolean, numeric, numeric, numeric, integer, integer, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
