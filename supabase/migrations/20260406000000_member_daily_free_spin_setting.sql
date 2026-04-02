-- 增加“每日免费抽奖次数”配置，并接入前端配额计算

ALTER TABLE public.member_portal_settings
ADD COLUMN IF NOT EXISTS daily_free_spins_per_day integer NOT NULL DEFAULT 0;

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
  p_daily_free_spins_per_day integer,
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
    share_reward_spins, invite_reward_spins, daily_free_spins_per_day, login_badges, footer_text,
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
    GREATEST(COALESCE(p_daily_free_spins_per_day, 0), 0),
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
    daily_free_spins_per_day = EXCLUDED.daily_free_spins_per_day,
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

CREATE OR REPLACE FUNCTION public.apply_member_portal_settings_payload(
  p_tenant_id uuid,
  p_payload jsonb,
  p_employee_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.member_portal_settings (
    tenant_id, company_name, logo_url, theme_primary_color,
    welcome_title, welcome_subtitle, announcement,
    enable_spin, enable_invite, enable_check_in, enable_share_reward,
    checkin_reward_base, checkin_reward_streak_3, checkin_reward_streak_7,
    share_reward_spins, invite_reward_spins, daily_free_spins_per_day, login_badges, footer_text,
    home_banners, show_announcement_popup, announcement_popup_title, announcement_popup_content,
    customer_service_label, customer_service_link, home_background_preset, home_module_order,
    updated_by
  ) VALUES (
    p_tenant_id,
    COALESCE(NULLIF(trim(COALESCE(p_payload->>'company_name', '')), ''), 'Spin & Win'),
    NULLIF(trim(COALESCE(p_payload->>'logo_url', '')), ''),
    COALESCE(NULLIF(trim(COALESCE(p_payload->>'theme_primary_color', '')), ''), '#f59e0b'),
    COALESCE(NULLIF(trim(COALESCE(p_payload->>'welcome_title', '')), ''), 'Premium Member Platform'),
    COALESCE(NULLIF(trim(COALESCE(p_payload->>'welcome_subtitle', '')), ''), 'Sign in to your member account'),
    NULLIF(trim(COALESCE(p_payload->>'announcement', '')), ''),
    COALESCE((p_payload->>'enable_spin')::boolean, true),
    COALESCE((p_payload->>'enable_invite')::boolean, true),
    COALESCE((p_payload->>'enable_check_in')::boolean, true),
    COALESCE((p_payload->>'enable_share_reward')::boolean, true),
    GREATEST(COALESCE((p_payload->>'checkin_reward_base')::numeric, 1), 0),
    GREATEST(COALESCE((p_payload->>'checkin_reward_streak_3')::numeric, 1.5), 0),
    GREATEST(COALESCE((p_payload->>'checkin_reward_streak_7')::numeric, 2), 0),
    GREATEST(COALESCE((p_payload->>'share_reward_spins')::integer, 1), 0),
    GREATEST(COALESCE((p_payload->>'invite_reward_spins')::integer, 3), 0),
    GREATEST(COALESCE((p_payload->>'daily_free_spins_per_day')::integer, 0), 0),
    COALESCE(p_payload->'login_badges', '["🏆 签到奖励","🎁 积分兑换","👥 邀请好友"]'::jsonb),
    COALESCE(NULLIF(trim(COALESCE(p_payload->>'footer_text', '')), ''), '账户数据安全加密，平台合规运营，请放心使用'),
    COALESCE(p_payload->'home_banners', '[]'::jsonb),
    COALESCE((p_payload->>'show_announcement_popup')::boolean, false),
    COALESCE(NULLIF(trim(COALESCE(p_payload->>'announcement_popup_title', '')), ''), '系统公告'),
    NULLIF(trim(COALESCE(p_payload->>'announcement_popup_content', '')), ''),
    COALESCE(NULLIF(trim(COALESCE(p_payload->>'customer_service_label', '')), ''), '联系客服'),
    NULLIF(trim(COALESCE(p_payload->>'customer_service_link', '')), ''),
    COALESCE(NULLIF(trim(COALESCE(p_payload->>'home_background_preset', '')), ''), 'deep_blue'),
    COALESCE(p_payload->'home_module_order', '["shortcuts","tasks","security"]'::jsonb),
    p_employee_id
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
    daily_free_spins_per_day = EXCLUDED.daily_free_spins_per_day,
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
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_member_portal_settings(p_tenant_id uuid DEFAULT NULL)
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
  v_is_super_admin boolean;
BEGIN
  v_employee_id := public.resolve_current_employee_id();
  IF v_employee_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  END IF;

  SELECT e.tenant_id, COALESCE(e.is_super_admin, false)
    INTO v_tenant_id, v_is_super_admin
  FROM public.employees e
  WHERE e.id = v_employee_id
  LIMIT 1;

  IF p_tenant_id IS NOT NULL THEN
    IF v_is_super_admin THEN
      v_tenant_id := p_tenant_id;
    ELSIF v_tenant_id IS NOT NULL AND v_tenant_id = p_tenant_id THEN
      v_tenant_id := p_tenant_id;
    END IF;
  END IF;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'TENANT_NOT_FOUND');
  END IF;

  PERFORM public.apply_due_member_portal_versions_for_tenant(v_tenant_id);
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
      'daily_free_spins_per_day', GREATEST(COALESCE(v_row.daily_free_spins_per_day, 0), 0),
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
        'daily_free_spins_per_day', 0,
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

  PERFORM public.apply_due_member_portal_versions_for_tenant(v_tenant_id);
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
      'daily_free_spins_per_day', GREATEST(COALESCE(v_row.daily_free_spins_per_day, 0), 0),
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

CREATE OR REPLACE FUNCTION public.member_get_default_portal_settings()
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
  SELECT t.id, t.tenant_name
    INTO v_tenant_id, v_tenant_name
  FROM public.tenants t
  JOIN public.member_portal_settings s ON s.tenant_id = t.id
  WHERE COALESCE(t.tenant_code, '') <> 'platform'
  ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST
  LIMIT 1;

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
        'daily_free_spins_per_day', 0,
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

  SELECT * INTO v_row
  FROM public.member_portal_settings s
  WHERE s.tenant_id = v_tenant_id
  LIMIT 1;

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
      'daily_free_spins_per_day', GREATEST(COALESCE(v_row.daily_free_spins_per_day, 0), 0),
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

CREATE OR REPLACE FUNCTION public.member_get_spin_quota(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_settings public.member_portal_settings%ROWTYPE;
  v_earned numeric := 0;
  v_credits int := 0;
  v_used_bonus bigint := 0;
  v_used_daily_today int := 0;
  v_bonus_remaining int := 0;
  v_daily_quota int := 0;
  v_daily_remaining int := 0;
  v_remaining int := 0;
BEGIN
  v_tenant_id := public.member_resolve_tenant_id(p_member_id);
  IF v_tenant_id IS NOT NULL THEN
    SELECT * INTO v_settings FROM public.member_portal_settings WHERE tenant_id = v_tenant_id LIMIT 1;
  END IF;

  SELECT COALESCE(SUM(reward_value), 0) INTO v_earned
  FROM public.check_ins
  WHERE member_id = p_member_id
    AND reward_type = 'spin';

  SELECT COALESCE(SUM(credits), 0)::int INTO v_credits
  FROM public.spin_credits
  WHERE member_id = p_member_id;

  SELECT COUNT(*) INTO v_used_bonus
  FROM public.spins
  WHERE member_id = p_member_id
    AND COALESCE(source, '') <> 'daily_free_auto';

  SELECT COUNT(*) INTO v_used_daily_today
  FROM public.spins
  WHERE member_id = p_member_id
    AND source = 'daily_free_auto'
    AND created_at::date = current_date;

  v_bonus_remaining := GREATEST(0, ((v_earned + v_credits)::bigint - v_used_bonus)::int);
  v_daily_quota := GREATEST(COALESCE(v_settings.daily_free_spins_per_day, 0), 0);
  v_daily_remaining := GREATEST(0, v_daily_quota - v_used_daily_today);
  v_remaining := v_bonus_remaining + v_daily_remaining;

  RETURN jsonb_build_object(
    'success', true,
    'remaining', v_remaining,
    'bonus_remaining', v_bonus_remaining,
    'daily_remaining', v_daily_remaining,
    'daily_quota', v_daily_quota
  );
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
  v_tenant_id uuid;
  v_settings public.member_portal_settings%ROWTYPE;
  v_wheel_rows public.member_spin_wheel_prizes%ROWTYPE[];
  v_wheel public.member_spin_wheel_prizes%ROWTYPE;
  v_total_rate numeric := 0;
  v_rand numeric := 0;
  v_acc_rate numeric := 0;
  v_result_name text;
  v_result_type text;
  v_result_prize_id uuid;
  v_earned numeric := 0;
  v_credits int := 0;
  v_used_bonus bigint := 0;
  v_used_daily_today int := 0;
  v_bonus_remaining int := 0;
  v_daily_quota int := 0;
  v_daily_remaining int := 0;
  v_remaining int := 0;
  v_effective_source text;
BEGIN
  v_tenant_id := public.member_resolve_tenant_id(p_member_id);
  IF v_tenant_id IS NOT NULL THEN
    SELECT * INTO v_settings FROM public.member_portal_settings WHERE tenant_id = v_tenant_id LIMIT 1;
    IF COALESCE(v_settings.enable_spin, true) = false THEN
      RETURN jsonb_build_object('success', false, 'error', 'SPIN_DISABLED');
    END IF;
  END IF;

  SELECT COALESCE(SUM(reward_value), 0) INTO v_earned
  FROM public.check_ins
  WHERE member_id = p_member_id
    AND reward_type = 'spin';

  SELECT COALESCE(SUM(credits), 0)::int INTO v_credits
  FROM public.spin_credits
  WHERE member_id = p_member_id;

  SELECT COUNT(*) INTO v_used_bonus
  FROM public.spins
  WHERE member_id = p_member_id
    AND COALESCE(source, '') <> 'daily_free_auto';

  SELECT COUNT(*) INTO v_used_daily_today
  FROM public.spins
  WHERE member_id = p_member_id
    AND source = 'daily_free_auto'
    AND created_at::date = current_date;

  v_bonus_remaining := GREATEST(0, ((v_earned + v_credits)::bigint - v_used_bonus)::int);
  v_daily_quota := GREATEST(COALESCE(v_settings.daily_free_spins_per_day, 0), 0);
  v_daily_remaining := GREATEST(0, v_daily_quota - v_used_daily_today);
  v_remaining := v_bonus_remaining + v_daily_remaining;

  IF v_remaining <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_SPIN_QUOTA', 'remaining', 0);
  END IF;

  IF v_daily_remaining > 0 THEN
    v_effective_source := 'daily_free_auto';
  ELSE
    v_effective_source := COALESCE(NULLIF(trim(COALESCE(p_source, '')), ''), 'bonus_quota');
  END IF;

  IF v_tenant_id IS NOT NULL THEN
    SELECT array_agg(w ORDER BY w.sort_order, w.created_at)
      INTO v_wheel_rows
    FROM public.member_spin_wheel_prizes w
    WHERE w.tenant_id = v_tenant_id
      AND w.enabled = true
      AND w.hit_rate > 0;

    IF v_wheel_rows IS NOT NULL AND array_length(v_wheel_rows, 1) IS NOT NULL THEN
      FOREACH v_wheel IN ARRAY v_wheel_rows LOOP
        v_total_rate := v_total_rate + COALESCE(v_wheel.hit_rate, 0);
      END LOOP;

      IF v_total_rate > 0 THEN
        v_rand := random() * v_total_rate;
        v_acc_rate := 0;
        FOREACH v_wheel IN ARRAY v_wheel_rows LOOP
          v_acc_rate := v_acc_rate + COALESCE(v_wheel.hit_rate, 0);
          IF v_rand <= v_acc_rate THEN
            v_result_name := v_wheel.name;
            v_result_type := v_wheel.prize_type;
            v_result_prize_id := NULL;
            EXIT;
          END IF;
        END LOOP;
      END IF;
    END IF;
  END IF;

  IF COALESCE(v_result_name, '') = '' THEN
    SELECT array_agg(p ORDER BY p.name) INTO v_prizes
    FROM public.prizes p
    WHERE p.stock = -1 OR p.stock > 0;

    IF v_prizes IS NULL OR array_length(v_prizes, 1) IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'NO_PRIZES');
    END IF;

    v_cnt := array_length(v_prizes, 1);
    v_idx := 1 + floor(random() * v_cnt)::int;
    v_prize := v_prizes[v_idx];
    v_result_name := v_prize.name;
    v_result_type := v_prize.type;
    v_result_prize_id := v_prize.id;

    IF v_prize.stock > 0 THEN
      UPDATE public.prizes SET stock = stock - 1 WHERE id = v_prize.id;
    END IF;
  END IF;

  INSERT INTO public.spins (member_id, spin_type, source, result, prize_id, status)
  VALUES (p_member_id, 'wheel', v_effective_source, v_result_name, v_result_prize_id, 'issued');

  RETURN jsonb_build_object(
    'success', true,
    'remaining', v_remaining - 1,
    'prize', jsonb_build_object('id', v_result_prize_id, 'name', v_result_name, 'type', v_result_type)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.member_get_default_portal_settings() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_get_spin_quota(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_spin(uuid, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
