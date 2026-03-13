-- 会员门户配置版本管理：版本历史、定时生效、回滚

CREATE TABLE IF NOT EXISTS public.member_portal_settings_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  version_no integer NOT NULL,
  payload jsonb NOT NULL,
  note text,
  effective_at timestamptz,
  is_applied boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_member_portal_settings_versions_tenant_version
  ON public.member_portal_settings_versions(tenant_id, version_no);
CREATE INDEX IF NOT EXISTS idx_member_portal_settings_versions_tenant_created
  ON public.member_portal_settings_versions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_member_portal_settings_versions_tenant_effective
  ON public.member_portal_settings_versions(tenant_id, effective_at);

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
    share_reward_spins, invite_reward_spins, login_badges, footer_text,
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

CREATE OR REPLACE FUNCTION public.apply_due_member_portal_versions_for_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.member_portal_settings_versions%ROWTYPE;
BEGIN
  SELECT *
    INTO v_row
  FROM public.member_portal_settings_versions
  WHERE tenant_id = p_tenant_id
    AND is_applied = false
    AND effective_at IS NOT NULL
    AND effective_at <= now()
  ORDER BY effective_at ASC, created_at ASC
  LIMIT 1;

  IF v_row.id IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.apply_member_portal_settings_payload(v_row.tenant_id, v_row.payload, v_row.created_by);

  UPDATE public.member_portal_settings_versions
  SET is_applied = true, applied_at = now()
  WHERE id = v_row.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_my_member_portal_settings_version(
  p_payload jsonb,
  p_note text DEFAULT NULL,
  p_effective_at timestamptz DEFAULT NULL
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
  v_next_version int;
  v_new_id uuid;
  v_apply_now boolean := false;
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

  SELECT COALESCE(MAX(version_no), 0) + 1 INTO v_next_version
  FROM public.member_portal_settings_versions
  WHERE tenant_id = v_tenant_id;

  IF p_effective_at IS NULL OR p_effective_at <= now() THEN
    v_apply_now := true;
  END IF;

  INSERT INTO public.member_portal_settings_versions (
    tenant_id, version_no, payload, note, effective_at, is_applied, created_by, applied_at
  ) VALUES (
    v_tenant_id, v_next_version, COALESCE(p_payload, '{}'::jsonb), NULLIF(trim(COALESCE(p_note, '')), ''),
    p_effective_at, v_apply_now, v_employee_id, CASE WHEN v_apply_now THEN now() ELSE NULL END
  )
  RETURNING id INTO v_new_id;

  IF v_apply_now THEN
    PERFORM public.apply_member_portal_settings_payload(v_tenant_id, COALESCE(p_payload, '{}'::jsonb), v_employee_id);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'version_id', v_new_id,
    'version_no', v_next_version,
    'is_applied', v_apply_now
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_my_member_portal_settings_versions(p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
  v_tenant_id uuid;
  v_rows jsonb;
BEGIN
  v_employee_id := public.resolve_current_employee_id();
  IF v_employee_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED', 'versions', '[]'::jsonb);
  END IF;

  SELECT e.tenant_id INTO v_tenant_id
  FROM public.employees e
  WHERE e.id = v_employee_id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'TENANT_NOT_FOUND', 'versions', '[]'::jsonb);
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', v.id,
        'version_no', v.version_no,
        'note', v.note,
        'effective_at', v.effective_at,
        'is_applied', v.is_applied,
        'created_at', v.created_at,
        'applied_at', v.applied_at
      ) ORDER BY v.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_rows
  FROM (
    SELECT *
    FROM public.member_portal_settings_versions
    WHERE tenant_id = v_tenant_id
    ORDER BY created_at DESC
    LIMIT GREATEST(COALESCE(p_limit, 20), 1)
  ) v;

  RETURN jsonb_build_object('success', true, 'versions', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.rollback_my_member_portal_settings_version(p_version_id uuid)
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
  v_version public.member_portal_settings_versions%ROWTYPE;
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

  SELECT * INTO v_version
  FROM public.member_portal_settings_versions
  WHERE id = p_version_id
    AND tenant_id = v_tenant_id
  LIMIT 1;

  IF v_version.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'VERSION_NOT_FOUND');
  END IF;

  PERFORM public.apply_member_portal_settings_payload(v_tenant_id, v_version.payload, v_employee_id);

  UPDATE public.member_portal_settings_versions
  SET is_applied = true, applied_at = now()
  WHERE id = v_version.id;

  RETURN jsonb_build_object('success', true);
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

  SELECT e.tenant_id INTO v_tenant_id FROM public.employees e WHERE e.id = v_employee_id LIMIT 1;
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

GRANT EXECUTE ON FUNCTION public.apply_member_portal_settings_payload(uuid, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_due_member_portal_versions_for_tenant(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_my_member_portal_settings_version(jsonb, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_member_portal_settings_versions(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rollback_my_member_portal_settings_version(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
