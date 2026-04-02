-- Tenant feature flags (phase 2 baseline)
-- Goal: allow per-tenant feature enable/disable with platform-level control.

CREATE TABLE IF NOT EXISTS public.tenant_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  flag_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, flag_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_feature_flags_tenant_flag
  ON public.tenant_feature_flags(tenant_id, flag_key);

ALTER TABLE public.tenant_feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_feature_flags_select_none ON public.tenant_feature_flags;
CREATE POLICY tenant_feature_flags_select_none
ON public.tenant_feature_flags
FOR SELECT
USING (false);

DROP POLICY IF EXISTS tenant_feature_flags_modify_none ON public.tenant_feature_flags;
CREATE POLICY tenant_feature_flags_modify_none
ON public.tenant_feature_flags
FOR ALL
USING (false)
WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.get_tenant_feature_flag(
  p_tenant_id uuid,
  p_flag_key text,
  p_default boolean DEFAULT true
)
RETURNS TABLE(enabled boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
BEGIN
  SELECT tff.enabled
    INTO v_enabled
  FROM public.tenant_feature_flags tff
  WHERE tff.tenant_id = p_tenant_id
    AND tff.flag_key = trim(lower(p_flag_key))
  LIMIT 1;

  RETURN QUERY SELECT COALESCE(v_enabled, p_default);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_feature_flags(
  p_tenant_id uuid
)
RETURNS TABLE(flag_key text, enabled boolean, updated_at timestamptz)
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

  IF NOT (v_actor.is_super_admin = true OR v_actor.tenant_id = p_tenant_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT tff.flag_key, tff.enabled, tff.updated_at
  FROM public.tenant_feature_flags tff
  WHERE tff.tenant_id = p_tenant_id
  ORDER BY tff.flag_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_tenant_feature_flag(
  p_tenant_id uuid,
  p_flag_key text,
  p_enabled boolean
)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.employees%ROWTYPE;
  v_norm_key text := trim(lower(p_flag_key));
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

  -- platform super admin can manage all tenants
  IF v_actor.is_super_admin = true THEN
    NULL;
  ELSIF v_actor.tenant_id = p_tenant_id AND v_actor.role IN ('admin', 'manager') THEN
    NULL;
  ELSE
    RETURN QUERY SELECT false, 'NO_PERMISSION';
    RETURN;
  END IF;

  IF v_norm_key = '' THEN
    RETURN QUERY SELECT false, 'INVALID_FLAG_KEY';
    RETURN;
  END IF;

  INSERT INTO public.tenant_feature_flags (tenant_id, flag_key, enabled, updated_by, updated_at)
  VALUES (p_tenant_id, v_norm_key, p_enabled, v_actor.id, now())
  ON CONFLICT (tenant_id, flag_key)
  DO UPDATE SET
    enabled = EXCLUDED.enabled,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  RETURN QUERY SELECT true, 'OK';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_feature_flag(uuid, text, boolean) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_tenant_feature_flags(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_tenant_feature_flag(uuid, text, boolean) TO authenticated;
