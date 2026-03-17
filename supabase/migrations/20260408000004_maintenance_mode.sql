-- Maintenance mode (global + tenant scope)

CREATE TABLE IF NOT EXISTS public.global_maintenance_mode (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  enabled boolean NOT NULL DEFAULT false,
  message text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_maintenance_mode (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  message text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.global_maintenance_mode ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_maintenance_mode ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS global_maintenance_mode_select_none ON public.global_maintenance_mode;
CREATE POLICY global_maintenance_mode_select_none
ON public.global_maintenance_mode
FOR SELECT
USING (false);

DROP POLICY IF EXISTS global_maintenance_mode_modify_none ON public.global_maintenance_mode;
CREATE POLICY global_maintenance_mode_modify_none
ON public.global_maintenance_mode
FOR ALL
USING (false)
WITH CHECK (false);

DROP POLICY IF EXISTS tenant_maintenance_mode_select_none ON public.tenant_maintenance_mode;
CREATE POLICY tenant_maintenance_mode_select_none
ON public.tenant_maintenance_mode
FOR SELECT
USING (false);

DROP POLICY IF EXISTS tenant_maintenance_mode_modify_none ON public.tenant_maintenance_mode;
CREATE POLICY tenant_maintenance_mode_modify_none
ON public.tenant_maintenance_mode
FOR ALL
USING (false)
WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.get_maintenance_mode_status(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE(
  global_enabled boolean,
  global_message text,
  tenant_enabled boolean,
  tenant_message text,
  effective_enabled boolean,
  scope text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_global_enabled boolean := false;
  v_global_message text := NULL;
  v_tenant_enabled boolean := false;
  v_tenant_message text := NULL;
  v_scope text := 'none';
BEGIN
  SELECT gm.enabled, gm.message
    INTO v_global_enabled, v_global_message
  FROM public.global_maintenance_mode gm
  WHERE gm.id = true
  LIMIT 1;

  IF p_tenant_id IS NOT NULL THEN
    SELECT tm.enabled, tm.message
      INTO v_tenant_enabled, v_tenant_message
    FROM public.tenant_maintenance_mode tm
    WHERE tm.tenant_id = p_tenant_id
    LIMIT 1;
  END IF;

  IF COALESCE(v_global_enabled, false) THEN
    v_scope := 'global';
  ELSIF COALESCE(v_tenant_enabled, false) THEN
    v_scope := 'tenant';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(v_global_enabled, false),
    v_global_message,
    COALESCE(v_tenant_enabled, false),
    v_tenant_message,
    (COALESCE(v_global_enabled, false) OR COALESCE(v_tenant_enabled, false)),
    v_scope;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_global_maintenance_mode(
  p_enabled boolean,
  p_message text DEFAULT NULL
)
RETURNS TABLE(success boolean, message text)
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

  IF v_actor.id IS NULL OR v_actor.is_super_admin <> true THEN
    RETURN QUERY SELECT false, 'NO_PERMISSION';
    RETURN;
  END IF;

  INSERT INTO public.global_maintenance_mode (id, enabled, message, updated_by, updated_at)
  VALUES (true, p_enabled, NULLIF(trim(COALESCE(p_message, '')), ''), v_actor.id, now())
  ON CONFLICT (id)
  DO UPDATE SET
    enabled = EXCLUDED.enabled,
    message = EXCLUDED.message,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  RETURN QUERY SELECT true, 'OK';
END;
$$;

CREATE OR REPLACE FUNCTION public.set_tenant_maintenance_mode(
  p_tenant_id uuid,
  p_enabled boolean,
  p_message text DEFAULT NULL
)
RETURNS TABLE(success boolean, message text)
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

  IF v_actor.id IS NULL OR v_actor.is_super_admin <> true THEN
    RETURN QUERY SELECT false, 'NO_PERMISSION';
    RETURN;
  END IF;

  INSERT INTO public.tenant_maintenance_mode (tenant_id, enabled, message, updated_by, updated_at)
  VALUES (p_tenant_id, p_enabled, NULLIF(trim(COALESCE(p_message, '')), ''), v_actor.id, now())
  ON CONFLICT (tenant_id)
  DO UPDATE SET
    enabled = EXCLUDED.enabled,
    message = EXCLUDED.message,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  RETURN QUERY SELECT true, 'OK';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_maintenance_modes()
RETURNS TABLE(tenant_id uuid, enabled boolean, message text, updated_at timestamptz)
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

  IF v_actor.id IS NULL OR v_actor.is_super_admin <> true THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT tm.tenant_id, tm.enabled, tm.message, tm.updated_at
  FROM public.tenant_maintenance_mode tm
  ORDER BY tm.updated_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_maintenance_mode_status(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_global_maintenance_mode(boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_tenant_maintenance_mode(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_maintenance_modes() TO authenticated;
