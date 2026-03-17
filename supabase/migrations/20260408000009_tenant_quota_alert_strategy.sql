-- Tenant quota (second batch)
-- 1) exceed strategy: BLOCK / WARN
-- 2) threshold alerts: 80% / 100%

ALTER TABLE public.tenant_quotas
  ADD COLUMN IF NOT EXISTS exceed_strategy text NOT NULL DEFAULT 'BLOCK';

UPDATE public.tenant_quotas
SET exceed_strategy = 'BLOCK'
WHERE exceed_strategy IS NULL OR exceed_strategy NOT IN ('BLOCK', 'WARN');

CREATE TABLE IF NOT EXISTS public.tenant_quota_alert_states (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  resource text NOT NULL,
  alert_date date NOT NULL,
  max_level integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, resource, alert_date)
);

ALTER TABLE public.tenant_quota_alert_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_quota_alert_states_select_none ON public.tenant_quota_alert_states;
CREATE POLICY tenant_quota_alert_states_select_none
ON public.tenant_quota_alert_states
FOR SELECT
USING (false);

DROP POLICY IF EXISTS tenant_quota_alert_states_modify_none ON public.tenant_quota_alert_states;
CREATE POLICY tenant_quota_alert_states_modify_none
ON public.tenant_quota_alert_states
FOR ALL
USING (false)
WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.notify_tenant_quota_threshold(
  p_tenant_id uuid,
  p_resource text,
  p_current_count integer,
  p_limit integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_level integer := 0;
  v_prev_level integer := 0;
  v_tenant_name text := '';
  v_title text;
  v_message text;
  v_resource_label text;
BEGIN
  IF p_limit IS NULL OR p_limit <= 0 THEN
    RETURN;
  END IF;

  IF p_current_count >= p_limit THEN
    v_level := 100;
  ELSIF p_current_count * 100 >= p_limit * 80 THEN
    v_level := 80;
  ELSE
    RETURN;
  END IF;

  SELECT COALESCE(max_level, 0)
    INTO v_prev_level
  FROM public.tenant_quota_alert_states
  WHERE tenant_id = p_tenant_id
    AND resource = p_resource
    AND alert_date = CURRENT_DATE
  LIMIT 1;

  IF v_prev_level >= v_level THEN
    RETURN;
  END IF;

  INSERT INTO public.tenant_quota_alert_states (
    tenant_id, resource, alert_date, max_level, updated_at
  )
  VALUES (
    p_tenant_id, p_resource, CURRENT_DATE, v_level, now()
  )
  ON CONFLICT (tenant_id, resource, alert_date)
  DO UPDATE SET
    max_level = GREATEST(public.tenant_quota_alert_states.max_level, EXCLUDED.max_level),
    updated_at = now();

  SELECT COALESCE(t.tenant_name, t.tenant_code, p_tenant_id::text)
    INTO v_tenant_name
  FROM public.tenants t
  WHERE t.id = p_tenant_id
  LIMIT 1;

  v_resource_label := CASE p_resource
    WHEN 'employees' THEN '员工'
    WHEN 'members' THEN '会员'
    ELSE '日订单'
  END;

  v_title := CASE
    WHEN v_level >= 100 THEN '租户配额已达上限'
    ELSE '租户配额预警（80%）'
  END;
  v_message := format(
    '租户[%s] 的%s配额使用量 %s/%s，级别：%s%%',
    v_tenant_name,
    v_resource_label,
    p_current_count,
    p_limit,
    v_level
  );

  -- Platform super admins
  INSERT INTO public.notifications (recipient_id, title, message, type, category, link, metadata)
  SELECT e.id, v_title, v_message, 'warning', 'quota', '/staff/admin/settings/tenant-quota',
         jsonb_build_object('tenant_id', p_tenant_id, 'resource', p_resource, 'level', v_level, 'count', p_current_count, 'limit', p_limit)
  FROM public.employees e
  WHERE e.is_super_admin = true;

  -- Tenant admins/managers
  INSERT INTO public.notifications (recipient_id, title, message, type, category, link, metadata)
  SELECT e.id, v_title, v_message, 'warning', 'quota', '/staff/system-settings',
         jsonb_build_object('tenant_id', p_tenant_id, 'resource', p_resource, 'level', v_level, 'count', p_current_count, 'limit', p_limit)
  FROM public.employees e
  WHERE e.tenant_id = p_tenant_id
    AND e.role IN ('admin', 'manager');
END;
$$;

DROP FUNCTION IF EXISTS public.check_my_tenant_quota(text, integer);
DROP FUNCTION IF EXISTS public.get_tenant_quota_status(uuid);
DROP FUNCTION IF EXISTS public.list_tenant_quotas();
DROP FUNCTION IF EXISTS public.set_tenant_quota(uuid, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.set_tenant_quota(
  p_tenant_id uuid,
  p_max_employees integer DEFAULT NULL,
  p_max_members integer DEFAULT NULL,
  p_max_daily_orders integer DEFAULT NULL,
  p_exceed_strategy text DEFAULT 'BLOCK'
)
RETURNS TABLE(success boolean, message text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor public.employees%ROWTYPE;
  v_strategy text := CASE WHEN upper(COALESCE(p_exceed_strategy, 'BLOCK')) = 'WARN' THEN 'WARN' ELSE 'BLOCK' END;
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
    exceed_strategy,
    updated_by,
    updated_at
  )
  VALUES (
    p_tenant_id,
    CASE WHEN p_max_employees IS NULL OR p_max_employees <= 0 THEN NULL ELSE p_max_employees END,
    CASE WHEN p_max_members IS NULL OR p_max_members <= 0 THEN NULL ELSE p_max_members END,
    CASE WHEN p_max_daily_orders IS NULL OR p_max_daily_orders <= 0 THEN NULL ELSE p_max_daily_orders END,
    v_strategy,
    v_actor.id,
    now()
  )
  ON CONFLICT (tenant_id)
  DO UPDATE SET
    max_employees = EXCLUDED.max_employees,
    max_members = EXCLUDED.max_members,
    max_daily_orders = EXCLUDED.max_daily_orders,
    exceed_strategy = EXCLUDED.exceed_strategy,
    updated_by = EXCLUDED.updated_by,
    updated_at = now();

  RETURN QUERY SELECT true, 'OK';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_tenant_quota_status(
  p_tenant_id uuid
)
RETURNS TABLE(
  tenant_id uuid,
  max_employees integer,
  max_members integer,
  max_daily_orders integer,
  exceed_strategy text,
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
    COALESCE(v_quota.exceed_strategy, 'BLOCK'),
    v_employees_count,
    v_members_count,
    v_daily_orders_count,
    (v_quota.max_employees IS NOT NULL AND v_employees_count >= v_quota.max_employees),
    (v_quota.max_members IS NOT NULL AND v_members_count >= v_quota.max_members),
    (v_quota.max_daily_orders IS NOT NULL AND v_daily_orders_count >= v_quota.max_daily_orders);
END;
$$;

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
  v_strategy text := 'BLOCK';
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

  v_strategy := COALESCE(v_row.exceed_strategy, 'BLOCK');

  IF v_limit IS NULL OR v_limit <= 0 THEN
    RETURN QUERY SELECT true, 'OK', 999999;
    RETURN;
  END IF;

  PERFORM public.notify_tenant_quota_threshold(
    v_tenant_id,
    v_resource,
    v_count,
    v_limit
  );
  PERFORM public.notify_tenant_quota_threshold(
    v_tenant_id,
    v_resource,
    v_count + v_increment,
    v_limit
  );

  IF v_count + v_increment > v_limit THEN
    IF v_strategy = 'WARN' THEN
      RETURN QUERY SELECT true, 'QUOTA_SOFT_EXCEEDED:' || v_resource, GREATEST(v_limit - v_count, 0);
    ELSE
      RETURN QUERY SELECT false, 'QUOTA_EXCEEDED:' || v_resource, GREATEST(v_limit - v_count, 0);
    END IF;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, 'OK', GREATEST(v_limit - (v_count + v_increment), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_tenant_quotas()
RETURNS TABLE(
  tenant_id uuid,
  max_employees integer,
  max_members integer,
  max_daily_orders integer,
  exceed_strategy text,
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
  SELECT q.tenant_id, q.max_employees, q.max_members, q.max_daily_orders, COALESCE(q.exceed_strategy, 'BLOCK'), q.updated_at
  FROM public.tenant_quotas q
  ORDER BY q.updated_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.notify_tenant_quota_threshold(uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_tenant_quota(uuid, integer, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_tenant_quota_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_my_tenant_quota(text, integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.list_tenant_quotas() TO authenticated;
