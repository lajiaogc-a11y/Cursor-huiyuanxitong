-- 会员前端租户化配置：公司名、Logo、活动开关

CREATE TABLE IF NOT EXISTS public.member_portal_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  company_name text NOT NULL DEFAULT 'Spin & Win',
  logo_url text,
  theme_primary_color text NOT NULL DEFAULT '#f59e0b',
  welcome_title text NOT NULL DEFAULT 'Premium Member Platform',
  welcome_subtitle text NOT NULL DEFAULT 'Sign in to your member account',
  announcement text,
  enable_spin boolean NOT NULL DEFAULT true,
  enable_invite boolean NOT NULL DEFAULT true,
  enable_check_in boolean NOT NULL DEFAULT true,
  enable_share_reward boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_portal_settings_tenant_id
  ON public.member_portal_settings(tenant_id);

CREATE OR REPLACE FUNCTION public.trg_touch_member_portal_settings_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_portal_settings_updated_at ON public.member_portal_settings;
CREATE TRIGGER trg_member_portal_settings_updated_at
BEFORE UPDATE ON public.member_portal_settings
FOR EACH ROW
EXECUTE FUNCTION public.trg_touch_member_portal_settings_updated_at();

-- 解析当前登录员工 ID（兼容 profile.employee_id 为空）
CREATE OR REPLACE FUNCTION public.resolve_current_employee_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
BEGIN
  SELECT e.id INTO v_employee_id
  FROM profiles p
  JOIN employees e ON e.id = p.employee_id
  WHERE p.id = auth.uid()
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    SELECT e.id INTO v_employee_id
    FROM profiles p
    JOIN employees e ON e.username = split_part(COALESCE(p.email, ''), '@', 1)
    WHERE p.id = auth.uid() AND COALESCE(p.email, '') <> ''
    LIMIT 1;
  END IF;

  RETURN v_employee_id;
END;
$$;

-- 员工端：读取当前租户会员前端配置
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
      'enable_share_reward', COALESCE(v_row.enable_share_reward, true)
    )
  );
END;
$$;

-- 员工端：更新当前租户会员前端配置（仅管理员）
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
  p_enable_share_reward boolean
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
    enable_spin, enable_invite, enable_check_in, enable_share_reward, updated_by
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
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 会员端：按 member_id 读取所属租户的前端配置
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
  SELECT COALESCE(ec.tenant_id, er.tenant_id)
  INTO v_tenant_id
  FROM public.members m
  LEFT JOIN public.employees ec ON ec.id = m.creator_id
  LEFT JOIN public.employees er ON er.id = m.recorder_id
  WHERE m.id = p_member_id
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
        'enable_share_reward', true
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
      'enable_share_reward', COALESCE(v_row.enable_share_reward, true)
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_current_employee_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_member_portal_settings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_my_member_portal_settings(text, text, text, text, text, text, boolean, boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_get_portal_settings(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
