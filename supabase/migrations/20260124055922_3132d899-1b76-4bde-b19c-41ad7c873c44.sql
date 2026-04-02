-- 创建权限变更历史记录表
CREATE TABLE public.permission_change_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  changed_by UUID REFERENCES public.employees(id),
  changed_by_name TEXT NOT NULL,
  changed_by_role TEXT NOT NULL,
  target_role TEXT NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('update', 'import', 'apply_template')),
  template_name TEXT,
  changes_summary JSONB NOT NULL DEFAULT '[]',
  before_data JSONB,
  after_data JSONB,
  ip_address TEXT
);

-- 添加索引以提高查询性能
CREATE INDEX idx_permission_change_logs_changed_at ON public.permission_change_logs(changed_at DESC);
CREATE INDEX idx_permission_change_logs_target_role ON public.permission_change_logs(target_role);
CREATE INDEX idx_permission_change_logs_changed_by ON public.permission_change_logs(changed_by);

-- 启用行级安全
ALTER TABLE public.permission_change_logs ENABLE ROW LEVEL SECURITY;

-- 创建策略：管理员可以查看所有日志
CREATE POLICY "Admins can view all permission logs"
ON public.permission_change_logs
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.profiles p ON p.employee_id = e.id
    WHERE p.id = auth.uid() AND e.role = 'admin'
  )
);

-- 创建策略：所有登录用户可以插入日志
CREATE POLICY "Authenticated users can insert permission logs"
ON public.permission_change_logs
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- 添加表注释
COMMENT ON TABLE public.permission_change_logs IS '权限变更历史记录';
COMMENT ON COLUMN public.permission_change_logs.action_type IS '操作类型: update(手动更新), import(导入), apply_template(应用模板)';
COMMENT ON COLUMN public.permission_change_logs.changes_summary IS '变更摘要JSON数组';
