-- Data migration tools (first batch)
-- 1) Dry-run preview (risk + conflict summary)
-- 2) Tenant data export (json)
-- 3) Migration job logs

CREATE TABLE IF NOT EXISTS public.tenant_migration_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  target_tenant_id uuid NULL REFERENCES public.tenants(id) ON DELETE SET NULL,
  operation text NOT NULL,
  status text NOT NULL,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_migration_jobs_created_at
  ON public.tenant_migration_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_migration_jobs_source
  ON public.tenant_migration_jobs(source_tenant_id, created_at DESC);

ALTER TABLE public.tenant_migration_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_migration_jobs_select_none ON public.tenant_migration_jobs;
CREATE POLICY tenant_migration_jobs_select_none
ON public.tenant_migration_jobs
FOR SELECT
USING (false);

DROP POLICY IF EXISTS tenant_migration_jobs_modify_none ON public.tenant_migration_jobs;
CREATE POLICY tenant_migration_jobs_modify_none
ON public.tenant_migration_jobs
FOR ALL
USING (false)
WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.is_platform_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.employees e
    JOIN public.profiles p ON p.employee_id = e.id
    WHERE p.id = auth.uid()
      AND e.is_super_admin = true
  );
$$;

CREATE OR REPLACE FUNCTION public.get_current_employee_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id
  FROM public.employees e
  JOIN public.profiles p ON p.employee_id = e.id
  WHERE p.id = auth.uid()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.preview_tenant_data_migration(
  p_source_tenant_id uuid,
  p_target_tenant_id uuid
)
RETURNS TABLE(
  source_tenant_id uuid,
  target_tenant_id uuid,
  source_counts jsonb,
  target_counts jsonb,
  conflict_summary jsonb,
  risk_level text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source_members integer := 0;
  v_source_orders integer := 0;
  v_source_employees integer := 0;
  v_target_members integer := 0;
  v_target_orders integer := 0;
  v_target_employees integer := 0;
  v_conflict_member_phone integer := 0;
  v_conflict_employee_username integer := 0;
  v_risk text := 'LOW';
BEGIN
  IF public.is_platform_super_admin() <> true THEN
    RETURN;
  END IF;

  IF p_source_tenant_id IS NULL OR p_target_tenant_id IS NULL OR p_source_tenant_id = p_target_tenant_id THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::integer INTO v_source_members
  FROM public.members
  WHERE tenant_id = p_source_tenant_id;

  SELECT COUNT(*)::integer INTO v_source_orders
  FROM public.orders
  WHERE tenant_id = p_source_tenant_id
    AND COALESCE(is_deleted, false) = false;

  SELECT COUNT(*)::integer INTO v_source_employees
  FROM public.employees
  WHERE tenant_id = p_source_tenant_id;

  SELECT COUNT(*)::integer INTO v_target_members
  FROM public.members
  WHERE tenant_id = p_target_tenant_id;

  SELECT COUNT(*)::integer INTO v_target_orders
  FROM public.orders
  WHERE tenant_id = p_target_tenant_id
    AND COALESCE(is_deleted, false) = false;

  SELECT COUNT(*)::integer INTO v_target_employees
  FROM public.employees
  WHERE tenant_id = p_target_tenant_id;

  SELECT COUNT(DISTINCT s.phone_number)::integer INTO v_conflict_member_phone
  FROM public.members s
  JOIN public.members t ON t.phone_number = s.phone_number
  WHERE s.tenant_id = p_source_tenant_id
    AND t.tenant_id = p_target_tenant_id
    AND s.phone_number IS NOT NULL;

  SELECT COUNT(DISTINCT s.username)::integer INTO v_conflict_employee_username
  FROM public.employees s
  JOIN public.employees t ON t.username = s.username
  WHERE s.tenant_id = p_source_tenant_id
    AND t.tenant_id = p_target_tenant_id
    AND s.username IS NOT NULL;

  IF v_conflict_member_phone > 0 OR v_conflict_employee_username > 0 THEN
    v_risk := 'HIGH';
  ELSIF v_source_orders > 10000 OR v_source_members > 5000 THEN
    v_risk := 'MEDIUM';
  END IF;

  INSERT INTO public.tenant_migration_jobs (
    source_tenant_id,
    target_tenant_id,
    operation,
    status,
    report,
    created_by
  ) VALUES (
    p_source_tenant_id,
    p_target_tenant_id,
    'DRY_RUN',
    'success',
    jsonb_build_object(
      'source_counts', jsonb_build_object('members', v_source_members, 'orders', v_source_orders, 'employees', v_source_employees),
      'target_counts', jsonb_build_object('members', v_target_members, 'orders', v_target_orders, 'employees', v_target_employees),
      'conflict_summary', jsonb_build_object('member_phone', v_conflict_member_phone, 'employee_username', v_conflict_employee_username),
      'risk_level', v_risk
    ),
    public.get_current_employee_id()
  );

  RETURN QUERY
  SELECT
    p_source_tenant_id,
    p_target_tenant_id,
    jsonb_build_object('members', v_source_members, 'orders', v_source_orders, 'employees', v_source_employees),
    jsonb_build_object('members', v_target_members, 'orders', v_target_orders, 'employees', v_target_employees),
    jsonb_build_object('member_phone', v_conflict_member_phone, 'employee_username', v_conflict_employee_username),
    v_risk;
END;
$$;

CREATE OR REPLACE FUNCTION public.export_tenant_data_json(
  p_source_tenant_id uuid,
  p_limit integer DEFAULT 5000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 5000), 100), 20000);
  v_result jsonb;
BEGIN
  IF public.is_platform_super_admin() <> true THEN
    RETURN jsonb_build_object('success', false, 'message', 'NO_PERMISSION');
  END IF;

  IF p_source_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'TENANT_REQUIRED');
  END IF;

  v_result := jsonb_build_object(
    'success', true,
    'tenant_id', p_source_tenant_id,
    'exported_at', now(),
    'members', (
      SELECT COALESCE(jsonb_agg(to_jsonb(m)), '[]'::jsonb)
      FROM (
        SELECT *
        FROM public.members
        WHERE tenant_id = p_source_tenant_id
        ORDER BY created_at DESC
        LIMIT v_limit
      ) m
    ),
    'orders', (
      SELECT COALESCE(jsonb_agg(to_jsonb(o)), '[]'::jsonb)
      FROM (
        SELECT *
        FROM public.orders
        WHERE tenant_id = p_source_tenant_id
          AND COALESCE(is_deleted, false) = false
        ORDER BY created_at DESC
        LIMIT v_limit
      ) o
    ),
    'employees', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'username', e.username,
          'real_name', e.real_name,
          'role', e.role,
          'status', e.status,
          'is_super_admin', e.is_super_admin,
          'visible', e.visible,
          'created_at', e.created_at,
          'updated_at', e.updated_at
        )
      ), '[]'::jsonb)
      FROM (
        SELECT *
        FROM public.employees
        WHERE tenant_id = p_source_tenant_id
        ORDER BY created_at DESC
        LIMIT v_limit
      ) e
    )
  );

  INSERT INTO public.tenant_migration_jobs (
    source_tenant_id,
    operation,
    status,
    report,
    created_by
  ) VALUES (
    p_source_tenant_id,
    'EXPORT',
    'success',
    jsonb_build_object(
      'limit', v_limit,
      'counts', jsonb_build_object(
        'members', jsonb_array_length(v_result->'members'),
        'orders', jsonb_array_length(v_result->'orders'),
        'employees', jsonb_array_length(v_result->'employees')
      )
    ),
    public.get_current_employee_id()
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_tenant_migration_jobs(
  p_limit integer DEFAULT 100
)
RETURNS TABLE(
  id uuid,
  source_tenant_id uuid,
  target_tenant_id uuid,
  operation text,
  status text,
  report jsonb,
  created_by uuid,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500);
BEGIN
  IF public.is_platform_super_admin() <> true THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    j.id,
    j.source_tenant_id,
    j.target_tenant_id,
    j.operation,
    j.status,
    j.report,
    j.created_by,
    j.created_at
  FROM public.tenant_migration_jobs j
  ORDER BY j.created_at DESC
  LIMIT v_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_platform_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_employee_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_tenant_data_migration(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.export_tenant_data_json(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_tenant_migration_jobs(integer) TO authenticated;
