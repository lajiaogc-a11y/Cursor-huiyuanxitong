-- Employee login 2FA (first batch)
-- Uses a second static 6-digit code as an extra factor.

CREATE TABLE IF NOT EXISTS public.employee_login_2fa_settings (
  employee_id uuid PRIMARY KEY REFERENCES public.employees(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  code_hash text,
  updated_by uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_login_2fa_enabled
  ON public.employee_login_2fa_settings(enabled);

ALTER TABLE public.employee_login_2fa_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_login_2fa_settings_select_none ON public.employee_login_2fa_settings;
CREATE POLICY employee_login_2fa_settings_select_none
ON public.employee_login_2fa_settings
FOR SELECT
USING (false);

DROP POLICY IF EXISTS employee_login_2fa_settings_modify_none ON public.employee_login_2fa_settings;
CREATE POLICY employee_login_2fa_settings_modify_none
ON public.employee_login_2fa_settings
FOR ALL
USING (false)
WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.verify_employee_login_2fa(
  p_username text,
  p_code text DEFAULT NULL
)
RETURNS TABLE(success boolean, message text, employee_id uuid, required boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee public.employees%ROWTYPE;
  v_setting public.employee_login_2fa_settings%ROWTYPE;
  v_code text := trim(COALESCE(p_code, ''));
BEGIN
  SELECT * INTO v_employee
  FROM public.employees
  WHERE username = trim(COALESCE(p_username, ''))
  LIMIT 1;

  IF v_employee.id IS NULL THEN
    RETURN QUERY SELECT false, 'USER_NOT_FOUND', NULL::uuid, false;
    RETURN;
  END IF;

  SELECT * INTO v_setting
  FROM public.employee_login_2fa_settings
  WHERE employee_id = v_employee.id
  LIMIT 1;

  IF v_setting.employee_id IS NULL OR v_setting.enabled = false THEN
    RETURN QUERY SELECT true, 'NOT_REQUIRED', v_employee.id, false;
    RETURN;
  END IF;

  IF v_code = '' THEN
    RETURN QUERY SELECT false, 'TWO_FACTOR_REQUIRED', v_employee.id, true;
    RETURN;
  END IF;

  IF COALESCE(v_setting.code_hash, '') = '' THEN
    RETURN QUERY SELECT false, 'TWO_FACTOR_NOT_CONFIGURED', v_employee.id, true;
    RETURN;
  END IF;

  IF crypt(v_code, v_setting.code_hash) = v_setting.code_hash THEN
    RETURN QUERY SELECT true, 'OK', v_employee.id, true;
  ELSE
    RETURN QUERY SELECT false, 'WRONG_2FA_CODE', v_employee.id, true;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_employee_login_2fa(
  p_employee_id uuid,
  p_enabled boolean,
  p_code text DEFAULT NULL
)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.employees%ROWTYPE;
  v_target public.employees%ROWTYPE;
  v_code text := trim(COALESCE(p_code, ''));
  v_existing public.employee_login_2fa_settings%ROWTYPE;
BEGIN
  SELECT e.* INTO v_actor
  FROM public.employees e
  JOIN public.profiles p ON p.employee_id = e.id
  WHERE p.id = auth.uid()
  LIMIT 1;

  IF v_actor.id IS NULL THEN
    RETURN QUERY SELECT false, 'NO_PERMISSION';
    RETURN;
  END IF;

  SELECT * INTO v_target
  FROM public.employees
  WHERE id = p_employee_id
  LIMIT 1;

  IF v_target.id IS NULL THEN
    RETURN QUERY SELECT false, 'TARGET_NOT_FOUND';
    RETURN;
  END IF;

  IF v_actor.is_super_admin = true THEN
    NULL;
  ELSIF v_actor.tenant_id = v_target.tenant_id AND v_actor.role IN ('admin', 'manager') THEN
    NULL;
  ELSE
    RETURN QUERY SELECT false, 'NO_PERMISSION';
    RETURN;
  END IF;

  SELECT * INTO v_existing
  FROM public.employee_login_2fa_settings
  WHERE employee_id = p_employee_id
  LIMIT 1;

  IF p_enabled = true THEN
    IF v_code <> '' AND v_code !~ '^[0-9]{6}$' THEN
      RETURN QUERY SELECT false, 'INVALID_2FA_CODE_FORMAT';
      RETURN;
    END IF;
    IF v_code = '' AND (v_existing.employee_id IS NULL OR COALESCE(v_existing.code_hash, '') = '') THEN
      RETURN QUERY SELECT false, 'TWO_FACTOR_CODE_REQUIRED';
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.employee_login_2fa_settings (employee_id, enabled, code_hash, updated_by, updated_at)
  VALUES (
    p_employee_id,
    p_enabled,
    CASE WHEN v_code <> '' THEN crypt(v_code, gen_salt('bf')) ELSE v_existing.code_hash END,
    v_actor.id,
    now()
  )
  ON CONFLICT (employee_id)
  DO UPDATE SET
    enabled = EXCLUDED.enabled,
    code_hash = CASE WHEN v_code <> '' THEN EXCLUDED.code_hash ELSE public.employee_login_2fa_settings.code_hash END,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  RETURN QUERY SELECT true, 'OK';
END;
$$;

CREATE OR REPLACE FUNCTION public.list_tenant_employee_login_2fa(
  p_tenant_id uuid
)
RETURNS TABLE(employee_id uuid, enabled boolean, updated_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.employees%ROWTYPE;
BEGIN
  SELECT e.* INTO v_actor
  FROM public.employees e
  JOIN public.profiles p ON p.employee_id = e.id
  WHERE p.id = auth.uid()
  LIMIT 1;

  IF v_actor.id IS NULL THEN
    RETURN;
  END IF;

  IF v_actor.is_super_admin = true THEN
    NULL;
  ELSIF v_actor.tenant_id = p_tenant_id AND v_actor.role IN ('admin', 'manager') THEN
    NULL;
  ELSE
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.employee_id, s.enabled, s.updated_at
  FROM public.employee_login_2fa_settings s
  JOIN public.employees e ON e.id = s.employee_id
  WHERE e.tenant_id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_employee_login_2fa(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_employee_login_2fa(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_tenant_employee_login_2fa(uuid) TO authenticated;
