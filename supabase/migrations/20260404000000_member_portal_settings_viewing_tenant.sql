-- 会员门户设置：支持按 viewingTenantId 操作，确保后台发布与前端会员端同步
-- 1. 确保 members.tenant_id 存在（member_resolve_tenant_id 依赖）
-- 2. get_my_member_portal_settings 支持 p_tenant_id
-- 3. create/submit/list/rollback/approve 支持 p_tenant_id

ALTER TABLE public.members ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);

-- 回填 members.tenant_id：从 creator_id/recorder_id 推断，确保会员能正确解析到租户
UPDATE public.members m
SET tenant_id = COALESCE(
  (SELECT e.tenant_id FROM public.employees e WHERE e.id = m.creator_id LIMIT 1),
  (SELECT e.tenant_id FROM public.employees e WHERE e.id = m.recorder_id LIMIT 1)
)
WHERE m.tenant_id IS NULL
  AND (m.creator_id IS NOT NULL OR m.recorder_id IS NOT NULL);

-- get_my_member_portal_settings: 可选 p_tenant_id，超级管理员可指定租户
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

  -- 当传入 p_tenant_id 且（超级管理员 或 与本人租户一致）时使用
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

-- create_my_member_portal_settings_version: 支持 p_tenant_id
CREATE OR REPLACE FUNCTION public.create_my_member_portal_settings_version(
  p_payload jsonb,
  p_note text DEFAULT NULL,
  p_effective_at timestamptz DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL
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
    tenant_id, version_no, payload, note, effective_at, is_applied, created_by, applied_at,
    approval_status, submitted_by, submitted_at, approved_by, approved_at
  ) VALUES (
    v_tenant_id, v_next_version, COALESCE(p_payload, '{}'::jsonb), NULLIF(trim(COALESCE(p_note, '')), ''),
    p_effective_at, v_apply_now, v_employee_id, CASE WHEN v_apply_now THEN now() ELSE NULL END,
    'approved', v_employee_id, now(), v_employee_id, now()
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

-- submit_my_member_portal_settings_for_approval: 支持 p_tenant_id
CREATE OR REPLACE FUNCTION public.submit_my_member_portal_settings_for_approval(
  p_payload jsonb,
  p_note text DEFAULT NULL,
  p_effective_at timestamptz DEFAULT NULL,
  p_tenant_id uuid DEFAULT NULL
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
  IF v_role <> 'manager' AND v_role <> 'admin' AND NOT v_is_super_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_PERMISSION');
  END IF;

  SELECT COALESCE(MAX(version_no), 0) + 1 INTO v_next_version
  FROM public.member_portal_settings_versions
  WHERE tenant_id = v_tenant_id;

  INSERT INTO public.member_portal_settings_versions (
    tenant_id, version_no, payload, note, effective_at, is_applied, created_by,
    approval_status, submitted_by, submitted_at
  ) VALUES (
    v_tenant_id, v_next_version, COALESCE(p_payload, '{}'::jsonb), NULLIF(trim(COALESCE(p_note, '')), ''),
    p_effective_at, false, v_employee_id,
    'pending', v_employee_id, now()
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object(
    'success', true,
    'version_id', v_new_id,
    'version_no', v_next_version
  );
END;
$$;

-- list_my_member_portal_settings_versions: 支持 p_tenant_id
CREATE OR REPLACE FUNCTION public.list_my_member_portal_settings_versions(
  p_limit int DEFAULT 20,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
  v_tenant_id uuid;
  v_is_super_admin boolean;
BEGIN
  v_employee_id := public.resolve_current_employee_id();
  IF v_employee_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED', 'versions', '[]'::jsonb);
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
    RETURN jsonb_build_object('success', false, 'error', 'TENANT_NOT_FOUND', 'versions', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'versions', COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'id', v.id,
          'version_no', v.version_no,
          'note', v.note,
          'effective_at', v.effective_at,
          'is_applied', v.is_applied,
          'approval_status', v.approval_status,
          'review_note', v.review_note,
          'created_at', v.created_at,
          'applied_at', v.applied_at
        ) ORDER BY v.created_at DESC
      )
      FROM (
        SELECT * FROM public.member_portal_settings_versions
        WHERE tenant_id = v_tenant_id
        ORDER BY created_at DESC
        LIMIT GREATEST(COALESCE(p_limit, 20), 1)
      ) v),
      '[]'::jsonb
    )
  );
END;
$$;

-- rollback_my_member_portal_settings_version: 支持 p_tenant_id
CREATE OR REPLACE FUNCTION public.rollback_my_member_portal_settings_version(
  p_version_id uuid,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
  v_tenant_id uuid;
  v_version public.member_portal_settings_versions%ROWTYPE;
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
  WHERE id = p_version_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- approve_my_member_portal_settings_version: 支持 p_tenant_id
CREATE OR REPLACE FUNCTION public.approve_my_member_portal_settings_version(
  p_version_id uuid,
  p_review_note text DEFAULT NULL,
  p_approve boolean DEFAULT true,
  p_tenant_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
  v_tenant_id uuid;
  v_version public.member_portal_settings_versions%ROWTYPE;
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

  SELECT * INTO v_version
  FROM public.member_portal_settings_versions
  WHERE id = p_version_id
    AND tenant_id = v_tenant_id
  LIMIT 1;

  IF v_version.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'VERSION_NOT_FOUND');
  END IF;

  IF p_approve THEN
    PERFORM public.apply_member_portal_settings_payload(v_tenant_id, v_version.payload, v_employee_id);
    UPDATE public.member_portal_settings_versions
    SET is_applied = true, applied_at = now(), approval_status = 'approved',
        approved_by = v_employee_id, approved_at = now(), review_note = NULLIF(trim(COALESCE(p_review_note, '')), '')
    WHERE id = p_version_id;
  ELSE
    UPDATE public.member_portal_settings_versions
    SET approval_status = 'rejected', review_note = NULLIF(trim(COALESCE(p_review_note, '')), '')
    WHERE id = p_version_id;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- upsert_my_member_portal_settings 也需要支持 p_tenant_id（保存草稿时可能用到）
-- 检查现有 upsert 是否被 MemberPortalSettings 调用
-- 当前发布流程用 create_my_member_portal_settings_version，草稿在 localStorage
-- 暂不修改 upsert，因草稿未直接写入 DB

NOTIFY pgrst, 'reload schema';
