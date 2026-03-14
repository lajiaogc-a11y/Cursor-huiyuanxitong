-- 会员登录页默认展示租户配置（未输入账号时）
-- 规则：优先选择最近更新且非系统租户（tenant_code != 'platform'）的配置

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
  SELECT s.tenant_id
    INTO v_tenant_id
  FROM public.member_portal_settings s
  JOIN public.tenants t ON t.id = s.tenant_id
  WHERE COALESCE(t.tenant_code, '') <> 'platform'
  ORDER BY s.updated_at DESC NULLS LAST, s.created_at DESC
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

GRANT EXECUTE ON FUNCTION public.member_get_default_portal_settings() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
