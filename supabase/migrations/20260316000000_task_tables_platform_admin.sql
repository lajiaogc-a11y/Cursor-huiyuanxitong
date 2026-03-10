-- 任务表 RLS：平台总管理员查看租户时，可操作该租户的任务数据
-- 原策略仅允许 tenant_id = 当前员工所属租户；平台管理员所属 platform 租户，查看 002 等时需放宽

-- task_templates: 平台管理员可操作任意租户
DROP POLICY IF EXISTS task_templates_tenant ON public.task_templates;
CREATE POLICY task_templates_tenant ON public.task_templates
  FOR ALL TO authenticated
  USING (
    tenant_id = (SELECT e.tenant_id FROM public.profiles p JOIN public.employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1)
    OR public.is_platform_super_admin(auth.uid())
  )
  WITH CHECK (
    tenant_id = (SELECT e.tenant_id FROM public.profiles p JOIN public.employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1)
    OR public.is_platform_super_admin(auth.uid())
  );

-- tasks: 平台管理员可操作任意租户
DROP POLICY IF EXISTS tasks_tenant ON public.tasks;
CREATE POLICY tasks_tenant ON public.tasks
  FOR ALL TO authenticated
  USING (
    tenant_id = (SELECT e.tenant_id FROM public.profiles p JOIN public.employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1)
    OR public.is_platform_super_admin(auth.uid())
  )
  WITH CHECK (
    tenant_id = (SELECT e.tenant_id FROM public.profiles p JOIN public.employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1)
    OR public.is_platform_super_admin(auth.uid())
  );

-- task_items: 通过 task 关联，任务所属租户匹配或平台管理员
DROP POLICY IF EXISTS task_items_tenant ON public.task_items;
CREATE POLICY task_items_tenant ON public.task_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_items.task_id
      AND (
        t.tenant_id = (SELECT e.tenant_id FROM public.profiles p JOIN public.employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1)
        OR public.is_platform_super_admin(auth.uid())
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_items.task_id
      AND (
        t.tenant_id = (SELECT e.tenant_id FROM public.profiles p JOIN public.employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1)
        OR public.is_platform_super_admin(auth.uid())
      )
    )
  );

-- task_posters: 平台管理员可操作任意租户
DROP POLICY IF EXISTS task_posters_tenant ON public.task_posters;
CREATE POLICY task_posters_tenant ON public.task_posters
  FOR ALL TO authenticated
  USING (
    tenant_id = (SELECT e.tenant_id FROM public.profiles p JOIN public.employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1)
    OR public.is_platform_super_admin(auth.uid())
  )
  WITH CHECK (
    tenant_id = (SELECT e.tenant_id FROM public.profiles p JOIN public.employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1)
    OR public.is_platform_super_admin(auth.uid())
  );

-- task_item_logs: 通过 task_item -> task 关联
DROP POLICY IF EXISTS task_item_logs_tenant ON public.task_item_logs;
CREATE POLICY task_item_logs_tenant ON public.task_item_logs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.task_items ti
      JOIN public.tasks t ON t.id = ti.task_id
      WHERE ti.id = task_item_logs.task_item_id
      AND (
        t.tenant_id = (SELECT e.tenant_id FROM public.profiles p JOIN public.employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1)
        OR public.is_platform_super_admin(auth.uid())
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.task_items ti
      JOIN public.tasks t ON t.id = ti.task_id
      WHERE ti.id = task_item_logs.task_item_id
      AND (
        t.tenant_id = (SELECT e.tenant_id FROM public.profiles p JOIN public.employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1)
        OR public.is_platform_super_admin(auth.uid())
      )
    )
  );
