-- 工作任务模块：任务模板、任务、任务项、历史日志
-- 支持租户隔离，兼容现有 RLS 策略

-- 1. 任务模板（客户维护 / 发动态）
CREATE TABLE IF NOT EXISTS public.task_templates (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  module text NOT NULL,
  description text,
  created_by uuid REFERENCES public.employees(id),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_task_templates_tenant ON public.task_templates(tenant_id);

-- 2. 任务（一次生成/分配行为对应一条）
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.task_templates(id) ON DELETE SET NULL,
  title text NOT NULL,
  total_items integer DEFAULT 0,
  status text DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  source_page text,
  created_by uuid REFERENCES public.employees(id),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_tasks_tenant ON public.tasks(tenant_id);
CREATE INDEX idx_tasks_template ON public.tasks(template_id);
CREATE INDEX idx_tasks_created_at ON public.tasks(created_at DESC);

-- 3. 任务海报库（发动态用，存储海报快照）
CREATE TABLE IF NOT EXISTS public.task_posters (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text,
  data_url text,
  source_page text DEFAULT 'rates_page',
  created_by uuid REFERENCES public.employees(id),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_task_posters_tenant ON public.task_posters(tenant_id);

-- 4. 任务项（每个手机号或海报）
CREATE TABLE IF NOT EXISTS public.task_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  assigned_to uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  phone text,
  poster_id uuid REFERENCES public.task_posters(id) ON DELETE SET NULL,
  remark text,
  status text DEFAULT 'todo' CHECK (status IN ('todo', 'done')),
  channel text,
  updated_by uuid REFERENCES public.employees(id),
  updated_at timestamptz,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_task_items_task ON public.task_items(task_id);
CREATE INDEX idx_task_items_assigned ON public.task_items(assigned_to);
CREATE INDEX idx_task_items_status ON public.task_items(status);

-- 5. 历史日志
CREATE TABLE IF NOT EXISTS public.task_item_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_item_id uuid NOT NULL REFERENCES public.task_items(id) ON DELETE CASCADE,
  action text NOT NULL,
  operator uuid REFERENCES public.employees(id),
  note text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX idx_task_item_logs_item ON public.task_item_logs(task_item_id);
CREATE INDEX idx_task_item_logs_created ON public.task_item_logs(created_at DESC);

-- 6. RLS 策略
ALTER TABLE public.task_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_posters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_item_logs ENABLE ROW LEVEL SECURITY;

-- 租户内可见
CREATE POLICY task_templates_tenant ON public.task_templates
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT e.tenant_id FROM public.profiles p JOIN public.employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1))
  WITH CHECK (tenant_id = (SELECT e.tenant_id FROM public.profiles p JOIN public.employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1));

CREATE POLICY tasks_tenant ON public.tasks
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT e.tenant_id FROM public.profiles p JOIN public.employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1))
  WITH CHECK (tenant_id = (SELECT e.tenant_id FROM public.profiles p JOIN public.employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1));

CREATE POLICY task_items_tenant ON public.task_items
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_items.task_id
      AND t.tenant_id = (SELECT e.tenant_id FROM public.profiles p JOIN public.employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_items.task_id
      AND t.tenant_id = (SELECT e.tenant_id FROM public.profiles p JOIN public.employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1)
    )
  );

CREATE POLICY task_posters_tenant ON public.task_posters
  FOR ALL TO authenticated
  USING (tenant_id = (SELECT e.tenant_id FROM public.profiles p JOIN public.employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1))
  WITH CHECK (tenant_id = (SELECT e.tenant_id FROM public.profiles p JOIN public.employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1));

CREATE POLICY task_item_logs_tenant ON public.task_item_logs
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.task_items ti
      JOIN public.tasks t ON t.id = ti.task_id
      WHERE ti.id = task_item_logs.task_item_id
      AND t.tenant_id = (SELECT e.tenant_id FROM public.profiles p JOIN public.employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.task_items ti
      JOIN public.tasks t ON t.id = ti.task_id
      WHERE ti.id = task_item_logs.task_item_id
      AND t.tenant_id = (SELECT e.tenant_id FROM public.profiles p JOIN public.employees e ON e.id = p.employee_id WHERE p.id = auth.uid() LIMIT 1)
    )
  );

-- 8. 插入默认任务模板（每个租户一条，由应用层或触发器处理，此处仅建表）
-- 应用启动时可检查并插入 customer_maintenance / post_dynamic
