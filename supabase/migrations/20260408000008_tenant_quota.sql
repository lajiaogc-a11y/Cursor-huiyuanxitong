-- Tenant quota (first batch)
-- resources:
-- 1) employees
-- 2) members
-- 3) daily_orders

CREATE TABLE IF NOT EXISTS public.tenant_quotas (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  max_employees integer NULL,
  max_members integer NULL,
  max_daily_orders integer NULL,
  updated_by uuid NULL REFERENCES public.employees(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tenant_quotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_quotas_select_none ON public.tenant_quotas;
CREATE POLICY tenant_quotas_select_none
ON public.tenant_quotas
FOR SELECT
USING (false);

DROP POLICY IF EXISTS tenant_quotas_modify_none ON public.tenant_quotas;
CREATE POLICY tenant_quotas_modify_none
ON public.tenant_quotas
FOR ALL
USING (false)
WITH CHECK (false);

DROP FUNCTION IF EXISTS public.set_tenant_quota(uuid, integer, integer, integer);
CREATE OR REPLACE FUNCTION public.set_tenant_quota(
  p_tenant_id uuid,
  p_max_employees integer DEFAULT NULL,
  p_max_members integer DEFAULT NULL,
  p_max_daily_orders integer DEFAULT NULL
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

  INSERT INTO public.tenant_quotas (
    tenant_id,
    max_employees,
    max_members,
    max_daily_orders,
    updated_by,
    updated_at
  )
  VALUES (
    p_tenant_id,
    CASE WHEN p_max_employees IS NULL OR p_max_employees <= 0 THEN NULL ELSE p_max_employees END,
    CASE WHEN p_max_members IS NULL OR p_max_members <= 0 THEN NULL ELSE p_max_members END,
    CASE WHEN p_max_daily_orders IS NULL OR p_max_daily_orders <= 0 THEN NULL ELSE p_max_daily_orders END,
    v_actor.id,
    now()
  )
  ON CONFLICT (tenant_id)
  DO UPDATE SET
    max_employees = EXCLUDED.max_employees,
    max_members = EXCLUDED.max_members,
    max_daily_orders = EXCLUDED.max_daily_orders,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  RETURN QUERY SELECT true, 'OK';
END;
$$;

DROP FUNCTION IF EXISTS public.get_tenant_quota_status(uuid);
CREATE OR REPLACE FUNCTION public.get_tenant_quota_status(
  p_tenant_id uuid
)
RETURNS TABLE(
  tenant_id uuid,
  max_employees integer,
  max_members integer,
  max_daily_orders integer,
  employees_count integer,
  members_count integer,
  daily_orders_count integer,
  employees_reached boolean,
  members_reached boolean,
  daily_orders_reached boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.employees%ROWTYPE;
  v_my_tenant_id uuid;
  v_quota public.tenant_quotas%ROWTYPE;
  v_employees_count integer := 0;
  v_members_count integer := 0;
  v_daily_orders_count integer := 0;
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
    v_my_tenant_id := p_tenant_id;
  ELSE
    v_my_tenant_id := v_actor.tenant_id;
    IF v_my_tenant_id IS DISTINCT FROM p_tenant_id THEN
      RETURN;
    END IF;
  END IF;

  SELECT * INTO v_quota
  FROM public.tenant_quotas
  WHERE tenant_id = v_my_tenant_id
  LIMIT 1;

  SELECT COUNT(*)::integer
    INTO v_employees_count
  FROM public.employees
  WHERE tenant_id = v_my_tenant_id;

  SELECT COUNT(*)::integer
    INTO v_members_count
  FROM public.members
  WHERE tenant_id = v_my_tenant_id;

  SELECT COUNT(*)::integer
    INTO v_daily_orders_count
  FROM public.orders
  WHERE tenant_id = v_my_tenant_id
    AND COALESCE(is_deleted, false) = false
    AND created_at >= date_trunc('day', now());

  RETURN QUERY
  SELECT
    v_my_tenant_id,
    v_quota.max_employees,
    v_quota.max_members,
    v_quota.max_daily_orders,
    v_employees_count,
    v_members_count,
    v_daily_orders_count,
    (v_quota.max_employees IS NOT NULL AND v_employees_count >= v_quota.max_employees),
    (v_quota.max_members IS NOT NULL AND v_members_count >= v_quota.max_members),
    (v_quota.max_daily_orders IS NOT NULL AND v_daily_orders_count >= v_quota.max_daily_orders);
END;
$$;

DROP FUNCTION IF EXISTS public.check_my_tenant_quota(text, integer);
CREATE OR REPLACE FUNCTION public.check_my_tenant_quota(
  p_resource text,
  p_increment integer DEFAULT 1
)
RETURNS TABLE(
  success boolean,
  message text,
  remaining integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_resource text := trim(lower(COALESCE(p_resource, '')));
  v_increment integer := GREATEST(COALESCE(p_increment, 1), 1);
  v_row record;
  v_limit integer;
  v_count integer;
BEGIN
  v_tenant_id := public.get_my_tenant_id();
  IF v_tenant_id IS NULL THEN
    RETURN QUERY SELECT false, 'TENANT_REQUIRED', 0;
    RETURN;
  END IF;

  SELECT *
    INTO v_row
  FROM public.get_tenant_quota_status(v_tenant_id)
  LIMIT 1;

  IF v_resource = 'employees' THEN
    v_limit := v_row.max_employees;
    v_count := v_row.employees_count;
  ELSIF v_resource = 'members' THEN
    v_limit := v_row.max_members;
    v_count := v_row.members_count;
  ELSIF v_resource = 'daily_orders' THEN
    v_limit := v_row.max_daily_orders;
    v_count := v_row.daily_orders_count;
  ELSE
    RETURN QUERY SELECT false, 'INVALID_RESOURCE', 0;
    RETURN;
  END IF;

  IF v_limit IS NULL OR v_limit <= 0 THEN
    RETURN QUERY SELECT true, 'OK', 999999;
    RETURN;
  END IF;

  IF v_count + v_increment > v_limit THEN
    RETURN QUERY SELECT false, 'QUOTA_EXCEEDED:' || v_resource, GREATEST(v_limit - v_count, 0);
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'OK', GREATEST(v_limit - (v_count + v_increment), 0);
END;
$$;

DROP FUNCTION IF EXISTS public.list_tenant_quotas();
CREATE OR REPLACE FUNCTION public.list_tenant_quotas()
RETURNS TABLE(
  tenant_id uuid,
  max_employees integer,
  max_members integer,
  max_daily_orders integer,
  updated_at timestamptz
)
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
  SELECT q.tenant_id, q.max_employees, q.max_members, q.max_daily_orders, q.updated_at
  FROM public.tenant_quotas q
  ORDER BY q.updated_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_tenant_quota(uuid, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_quota_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_my_tenant_quota(text, integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.list_tenant_quotas() TO authenticated;
