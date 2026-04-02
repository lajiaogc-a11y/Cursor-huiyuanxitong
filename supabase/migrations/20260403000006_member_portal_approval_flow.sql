-- 会员门户版本审批流

ALTER TABLE public.member_portal_settings_versions
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.employees(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

CREATE INDEX IF NOT EXISTS idx_member_portal_versions_tenant_approval
  ON public.member_portal_settings_versions(tenant_id, approval_status, created_at DESC);

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

CREATE OR REPLACE FUNCTION public.submit_my_member_portal_settings_for_approval(
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
  v_next_version int;
  v_new_id uuid;
  v_rec RECORD;
BEGIN
  v_employee_id := public.resolve_current_employee_id();
  IF v_employee_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  END IF;

  SELECT e.tenant_id, e.role INTO v_tenant_id, v_role
  FROM public.employees e
  WHERE e.id = v_employee_id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'TENANT_NOT_FOUND');
  END IF;
  IF v_role <> 'manager' AND v_role <> 'admin' THEN
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

  -- 通知本租户管理员：有新的待审核版本
  FOR v_rec IN
    SELECT e.id
    FROM public.employees e
    WHERE e.tenant_id = v_tenant_id
      AND (e.role = 'admin' OR COALESCE(e.is_super_admin, false) = true)
      AND e.id <> v_employee_id
  LOOP
    INSERT INTO public.notifications (
      recipient_id, title, message, type, category, link, metadata
    ) VALUES (
      v_rec.id,
      '会员系统配置待审核',
      '有新的会员系统配置版本待审核，版本号 V' || v_next_version::text,
      'warning',
      'member_portal_approval',
      '/staff/member-portal',
      jsonb_build_object('version_id', v_new_id, 'version_no', v_next_version, 'action', 'submitted')
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'version_id', v_new_id,
    'version_no', v_next_version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_my_member_portal_settings_version(
  p_version_id uuid,
  p_review_note text DEFAULT NULL,
  p_approve boolean DEFAULT true
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
  v_version public.member_portal_settings_versions%ROWTYPE;
  v_notify_msg text;
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
  IF v_version.approval_status <> 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS');
  END IF;

  IF COALESCE(p_approve, true) = false THEN
    UPDATE public.member_portal_settings_versions
    SET approval_status = 'rejected',
        review_note = NULLIF(trim(COALESCE(p_review_note, '')), ''),
        approved_by = v_employee_id,
        approved_at = now()
    WHERE id = v_version.id;

    -- 通知提交人：已驳回
    INSERT INTO public.notifications (
      recipient_id, title, message, type, category, link, metadata
    ) VALUES (
      v_version.submitted_by,
      '会员系统配置审核被驳回',
      '版本 V' || v_version.version_no::text || ' 审核未通过，请根据意见修改后重新提交。',
      'error',
      'member_portal_approval',
      '/staff/member-portal',
      jsonb_build_object('version_id', v_version.id, 'version_no', v_version.version_no, 'action', 'rejected')
    );

    RETURN jsonb_build_object('success', true, 'approved', false);
  END IF;

  UPDATE public.member_portal_settings_versions
  SET approval_status = 'approved',
      review_note = NULLIF(trim(COALESCE(p_review_note, '')), ''),
      approved_by = v_employee_id,
      approved_at = now()
  WHERE id = v_version.id;

  IF v_version.effective_at IS NULL OR v_version.effective_at <= now() THEN
    PERFORM public.apply_member_portal_settings_payload(v_tenant_id, v_version.payload, v_employee_id);
    UPDATE public.member_portal_settings_versions
    SET is_applied = true, applied_at = now()
    WHERE id = v_version.id;
  END IF;

  IF v_version.effective_at IS NULL OR v_version.effective_at <= now() THEN
    v_notify_msg := '版本 V' || v_version.version_no::text || ' 已审核通过并发布生效。';
  ELSE
    v_notify_msg := '版本 V' || v_version.version_no::text || ' 已审核通过，将按定时计划生效。';
  END IF;

  -- 通知提交人：审核通过
  INSERT INTO public.notifications (
    recipient_id, title, message, type, category, link, metadata
  ) VALUES (
    v_version.submitted_by,
    '会员系统配置审核通过',
    v_notify_msg,
    'success',
    'member_portal_approval',
    '/staff/member-portal',
    jsonb_build_object('version_id', v_version.id, 'version_no', v_version.version_no, 'action', 'approved')
  );

  RETURN jsonb_build_object('success', true, 'approved', true);
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
    AND approval_status = 'approved'
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
        'approval_status', v.approval_status,
        'review_note', v.review_note,
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

GRANT EXECUTE ON FUNCTION public.submit_my_member_portal_settings_for_approval(jsonb, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_my_member_portal_settings_version(uuid, text, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
