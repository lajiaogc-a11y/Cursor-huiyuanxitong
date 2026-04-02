-- 创建权限版本管理表
CREATE TABLE public.permission_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  version_name TEXT NOT NULL,
  version_description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.employees(id),
  created_by_name TEXT NOT NULL,
  target_role TEXT NOT NULL,
  permissions_snapshot JSONB NOT NULL,
  is_auto_backup BOOLEAN DEFAULT false
);

-- 添加索引
CREATE INDEX idx_permission_versions_created_at ON public.permission_versions(created_at DESC);
CREATE INDEX idx_permission_versions_target_role ON public.permission_versions(target_role);
CREATE INDEX idx_permission_versions_is_auto ON public.permission_versions(is_auto_backup);

-- 启用行级安全
ALTER TABLE public.permission_versions ENABLE ROW LEVEL SECURITY;

-- 创建策略：管理员可以查看所有版本
CREATE POLICY "Admins can view all permission versions"
ON public.permission_versions
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.profiles p ON p.employee_id = e.id
    WHERE p.id = auth.uid() AND e.role = 'admin'
  )
);

-- 创建策略：所有登录用户可以插入版本
CREATE POLICY "Authenticated users can insert permission versions"
ON public.permission_versions
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- 创建策略：管理员可以删除版本
CREATE POLICY "Admins can delete permission versions"
ON public.permission_versions
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    JOIN public.profiles p ON p.employee_id = e.id
    WHERE p.id = auth.uid() AND e.role = 'admin'
  )
);

-- 更新 permission_change_logs 表，添加回滚支持
ALTER TABLE public.permission_change_logs 
  ADD COLUMN IF NOT EXISTS is_rollback BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS rollback_to_version_id UUID REFERENCES public.permission_versions(id);

-- 更新 action_type 约束以支持 rollback
ALTER TABLE public.permission_change_logs 
  DROP CONSTRAINT IF EXISTS permission_change_logs_action_type_check;
  
ALTER TABLE public.permission_change_logs 
  ADD CONSTRAINT permission_change_logs_action_type_check 
  CHECK (action_type IN ('update', 'import', 'apply_template', 'rollback', 'save_version'));

-- 添加表注释
COMMENT ON TABLE public.permission_versions IS '权限配置版本管理';
COMMENT ON COLUMN public.permission_versions.is_auto_backup IS '是否为自动备份（保存前自动创建）';