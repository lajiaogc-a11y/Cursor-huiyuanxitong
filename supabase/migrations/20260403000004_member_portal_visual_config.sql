-- 会员前端装修配置（轮播/弹窗/客服/背景/模块顺序）

ALTER TABLE public.member_portal_settings
  ADD COLUMN IF NOT EXISTS home_banners jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS show_announcement_popup boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS announcement_popup_title text NOT NULL DEFAULT '系统公告',
  ADD COLUMN IF NOT EXISTS announcement_popup_content text,
  ADD COLUMN IF NOT EXISTS customer_service_label text NOT NULL DEFAULT '联系客服',
  ADD COLUMN IF NOT EXISTS customer_service_link text,
  ADD COLUMN IF NOT EXISTS home_background_preset text NOT NULL DEFAULT 'deep_blue',
  ADD COLUMN IF NOT EXISTS home_module_order jsonb NOT NULL DEFAULT '["shortcuts","tasks","security"]'::jsonb;

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

  SELECT e.tenant_id INTO v_tenant_id FROM public.employees e WHERE e.id = v_employee_id LIMIT 1;
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
      'footer_text', COALESCE(v_row.footer_text, '账户数据安全加密，平台合规运营，请放心使用'),
      'home_banners', COALESCE(v_row.home_banners, '[]'::jsonb),
      'show_announcement_popup', COALESCE(v_row.show_announcement_popup, false),
      'announcement_popup_title', COALESCE(v_row.announcement_popup_title, '系统公告'),
      'announcement_popup_content', v_row.announcement_popup_content,
      'customer_service_label', COALESCE(v_row.customer_service_label, '联系客服'),
      'customer_service_link', v_row.customer_service_link,
      'home_background_preset', COALESCE(v_row.home_background_preset, 'deep_blue'),
      'home_module_order', COALESCE(v_row.home_module_order, '["shortcuts","tasks","security"]'::jsonb)
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
  p_footer_text text,
  p_home_banners jsonb,
  p_show_announcement_popup boolean,
  p_announcement_popup_title text,
  p_announcement_popup_content text,
  p_customer_service_label text,
  p_customer_service_link text,
  p_home_background_preset text,
  p_home_module_order jsonb
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
    share_reward_spins, invite_reward_spins, login_badges, footer_text,
    home_banners, show_announcement_popup, announcement_popup_title, announcement_popup_content,
    customer_service_label, customer_service_link, home_background_preset, home_module_order,
    updated_by
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
    COALESCE(p_home_banners, '[]'::jsonb),
    COALESCE(p_show_announcement_popup, false),
    COALESCE(NULLIF(trim(COALESCE(p_announcement_popup_title, '')), ''), '系统公告'),
    NULLIF(trim(COALESCE(p_announcement_popup_content, '')), ''),
    COALESCE(NULLIF(trim(COALESCE(p_customer_service_label, '')), ''), '联系客服'),
    NULLIF(trim(COALESCE(p_customer_service_link, '')), ''),
    COALESCE(NULLIF(trim(COALESCE(p_home_background_preset, '')), ''), 'deep_blue'),
    COALESCE(p_home_module_order, '["shortcuts","tasks","security"]'::jsonb),
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
    home_banners = EXCLUDED.home_banners,
    show_announcement_popup = EXCLUDED.show_announcement_popup,
    announcement_popup_title = EXCLUDED.announcement_popup_title,
    announcement_popup_content = EXCLUDED.announcement_popup_content,
    customer_service_label = EXCLUDED.customer_service_label,
    customer_service_link = EXCLUDED.customer_service_link,
    home_background_preset = EXCLUDED.home_background_preset,
    home_module_order = EXCLUDED.home_module_order,
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
        'footer_text', '账户数据安全加密，平台合规运营，请放心使用',
        'home_banners', '[]'::jsonb,
        'show_announcement_popup', false,
        'announcement_popup_title', '系统公告',
        'announcement_popup_content', null,
        'customer_service_label', '联系客服',
        'customer_service_link', null,
        'home_background_preset', 'deep_blue',
        'home_module_order', '["shortcuts","tasks","security"]'::jsonb
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
      'footer_text', COALESCE(v_row.footer_text, '账户数据安全加密，平台合规运营，请放心使用'),
      'home_banners', COALESCE(v_row.home_banners, '[]'::jsonb),
      'show_announcement_popup', COALESCE(v_row.show_announcement_popup, false),
      'announcement_popup_title', COALESCE(v_row.announcement_popup_title, '系统公告'),
      'announcement_popup_content', v_row.announcement_popup_content,
      'customer_service_label', COALESCE(v_row.customer_service_label, '联系客服'),
      'customer_service_link', v_row.customer_service_link,
      'home_background_preset', COALESCE(v_row.home_background_preset, 'deep_blue'),
      'home_module_order', COALESCE(v_row.home_module_order, '["shortcuts","tasks","security"]'::jsonb)
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
  SELECT m.id INTO v_member_id FROM public.members m WHERE m.member_code = trim(COALESCE(p_code, '')) LIMIT 1;
  IF v_member_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CODE');
  END IF;
  RETURN public.member_get_portal_settings(v_member_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_my_member_portal_settings(text, text, text, text, text, text, boolean, boolean, boolean, boolean, numeric, numeric, numeric, integer, integer, jsonb, text, jsonb, boolean, text, text, text, text, text, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
