-- 解决 profiles.employee_id 为空时 RLS 拦截导致各类数据不可见
-- 1. get_my_tenant_id() - 辅助函数，供 RLS 使用
-- 2. get_shared_data_for_my_tenant - 共享数据读取（商家结算、国家、系统设置等）
-- 3. get_my_tenant_employees_full - 员工列表（租户员工查看本租户员工）
-- 4. 更新 task_* 表 RLS 使用 get_my_tenant_id()

-- ========== 0. 辅助函数：解析当前用户租户（含 email 兜底）==========
CREATE OR REPLACE FUNCTION public.get_my_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(
    (SELECT e.tenant_id FROM profiles p JOIN employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1),
    (SELECT e.tenant_id FROM profiles p JOIN employees e ON e.username = split_part(COALESCE(p.email, ''), '@', 1)
     WHERE p.id = auth.uid() AND COALESCE(p.email, '') != '' LIMIT 1)
  );
$$;

-- ========== 1. 共享数据读取 RPC ==========
CREATE OR REPLACE FUNCTION public.get_shared_data_for_my_tenant(p_data_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant_id uuid;
  v_val jsonb;
BEGIN
  SELECT e.tenant_id INTO v_tenant_id
  FROM profiles p
  JOIN employees e ON e.id = p.employee_id
  WHERE p.id = auth.uid()
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    SELECT e.tenant_id INTO v_tenant_id
    FROM profiles p
    JOIN employees e ON e.username = split_part(COALESCE(p.email, ''), '@', 1)
    WHERE p.id = auth.uid() AND COALESCE(p.email, '') != ''
    LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT data_value INTO v_val
  FROM public.shared_data_store
  WHERE tenant_id = v_tenant_id AND data_key = p_data_key
  LIMIT 1;

  RETURN v_val;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_shared_data_for_my_tenant(text) TO authenticated;

-- ========== 2. 本租户员工列表 RPC ==========
CREATE OR REPLACE FUNCTION public.get_my_tenant_employees_full()
RETURNS SETOF public.employees
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant_id uuid;
  v_002_id uuid;
BEGIN
  SELECT e.tenant_id INTO v_tenant_id
  FROM profiles p
  JOIN employees e ON e.id = p.employee_id
  WHERE p.id = auth.uid()
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    SELECT e.tenant_id INTO v_tenant_id
    FROM profiles p
    JOIN employees e ON e.username = split_part(COALESCE(p.email, ''), '@', 1)
    WHERE p.id = auth.uid() AND COALESCE(p.email, '') != ''
    LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO v_002_id FROM public.tenants WHERE tenant_code = '002' LIMIT 1;

  IF v_tenant_id = v_002_id THEN
    RETURN QUERY SELECT e.* FROM public.employees e
    WHERE e.tenant_id = v_002_id OR e.tenant_id IS NULL
    ORDER BY e.created_at DESC;
  ELSE
    RETURN QUERY SELECT e.* FROM public.employees e
    WHERE e.tenant_id = v_tenant_id
    ORDER BY e.created_at DESC;
  END IF;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_my_tenant_employees_full() TO authenticated;

-- 扩展 platform_get_tenant_employees_full：允许租户员工查看本租户（与 get_my_tenant_employees_full 逻辑一致）
CREATE OR REPLACE FUNCTION public.platform_get_tenant_employees_full(p_tenant_id uuid)
RETURNS SETOF public.employees
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_my_tenant_id uuid;
  v_tenant_code text;
BEGIN
  IF public.is_platform_super_admin(auth.uid()) THEN
    SELECT t.tenant_code INTO v_tenant_code FROM public.tenants t WHERE t.id = p_tenant_id LIMIT 1;
    RETURN QUERY SELECT e.* FROM public.employees e
    WHERE e.tenant_id = p_tenant_id
      AND (v_tenant_code = 'platform' OR NOT (e.username = 'admin' AND e.is_super_admin = true))
    ORDER BY e.created_at ASC;
    RETURN;
  END IF;

  SELECT e.tenant_id INTO v_my_tenant_id
  FROM profiles p JOIN employees e ON e.id = p.employee_id
  WHERE p.id = auth.uid() LIMIT 1;
  IF v_my_tenant_id IS NULL THEN
    SELECT e.tenant_id INTO v_my_tenant_id
    FROM profiles p JOIN employees e ON e.username = split_part(COALESCE(p.email, ''), '@', 1)
    WHERE p.id = auth.uid() AND COALESCE(p.email, '') != '' LIMIT 1;
  END IF;

  IF v_my_tenant_id = p_tenant_id THEN
    RETURN QUERY SELECT e.* FROM public.employees e
    WHERE e.tenant_id = p_tenant_id
    ORDER BY e.created_at DESC;
  END IF;
END;
$fn$;

-- ========== 4. 更新 task_* 表 RLS 使用 get_my_tenant_id() ==========
DROP POLICY IF EXISTS task_templates_tenant ON public.task_templates;
CREATE POLICY task_templates_tenant ON public.task_templates
  FOR ALL TO authenticated
  USING (tenant_id = public.get_my_tenant_id() OR public.is_platform_super_admin(auth.uid()))
  WITH CHECK (tenant_id = public.get_my_tenant_id() OR public.is_platform_super_admin(auth.uid()));

DROP POLICY IF EXISTS tasks_tenant ON public.tasks;
CREATE POLICY tasks_tenant ON public.tasks
  FOR ALL TO authenticated
  USING (tenant_id = public.get_my_tenant_id() OR public.is_platform_super_admin(auth.uid()))
  WITH CHECK (tenant_id = public.get_my_tenant_id() OR public.is_platform_super_admin(auth.uid()));

DROP POLICY IF EXISTS task_items_tenant ON public.task_items;
CREATE POLICY task_items_tenant ON public.task_items
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_items.task_id
      AND (t.tenant_id = public.get_my_tenant_id() OR public.is_platform_super_admin(auth.uid())))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_items.task_id
      AND (t.tenant_id = public.get_my_tenant_id() OR public.is_platform_super_admin(auth.uid())))
  );

DROP POLICY IF EXISTS task_posters_tenant ON public.task_posters;
CREATE POLICY task_posters_tenant ON public.task_posters
  FOR ALL TO authenticated
  USING (tenant_id = public.get_my_tenant_id() OR public.is_platform_super_admin(auth.uid()))
  WITH CHECK (tenant_id = public.get_my_tenant_id() OR public.is_platform_super_admin(auth.uid()));

DROP POLICY IF EXISTS task_item_logs_tenant ON public.task_item_logs;
CREATE POLICY task_item_logs_tenant ON public.task_item_logs
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.task_items ti JOIN public.tasks t ON t.id = ti.task_id
      WHERE ti.id = task_item_logs.task_item_id
      AND (t.tenant_id = public.get_my_tenant_id() OR public.is_platform_super_admin(auth.uid())))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.task_items ti JOIN public.tasks t ON t.id = ti.task_id
      WHERE ti.id = task_item_logs.task_item_id
      AND (t.tenant_id = public.get_my_tenant_id() OR public.is_platform_super_admin(auth.uid())))
  );

-- ========== 5. 更新 shared_data_store RLS 使用 get_my_tenant_id() ==========
DROP POLICY IF EXISTS shared_data_store_tenant_select ON public.shared_data_store;
CREATE POLICY shared_data_store_tenant_select ON public.shared_data_store
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_my_tenant_id() OR public.is_platform_super_admin(auth.uid()));

DROP POLICY IF EXISTS shared_data_store_tenant_insert ON public.shared_data_store;
CREATE POLICY shared_data_store_tenant_insert ON public.shared_data_store
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_my_tenant_id() OR public.is_platform_super_admin(auth.uid()));

DROP POLICY IF EXISTS shared_data_store_tenant_update ON public.shared_data_store;
CREATE POLICY shared_data_store_tenant_update ON public.shared_data_store
  FOR UPDATE TO authenticated
  USING (tenant_id = public.get_my_tenant_id() OR public.is_platform_super_admin(auth.uid()))
  WITH CHECK (tenant_id = public.get_my_tenant_id() OR public.is_platform_super_admin(auth.uid()));

DROP POLICY IF EXISTS shared_data_store_tenant_delete ON public.shared_data_store;
CREATE POLICY shared_data_store_tenant_delete ON public.shared_data_store
  FOR DELETE TO authenticated
  USING (tenant_id = public.get_my_tenant_id() OR public.is_platform_super_admin(auth.uid()));

-- ========== 6. 更新 employees RLS 使用 get_my_tenant_id() ==========
DROP POLICY IF EXISTS employees_tenant_select ON public.employees;
CREATE POLICY employees_tenant_select ON public.employees
  FOR SELECT TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'staff'::app_role))
    AND (
      public.is_platform_super_admin(auth.uid())
      OR (public.get_my_tenant_id() IS NOT NULL AND employees.tenant_id = public.get_my_tenant_id())
    )
  );
