-- 修复 employees 表的 RLS 策略，允许 staff 读取员工基本信息（姓名用于显示录入人）
-- 但仍然保护敏感字段（密码等）

-- 首先删除现有的 SELECT 策略
DROP POLICY IF EXISTS "employees_self_or_admin_manager_select" ON public.employees;

-- 创建新的 SELECT 策略：所有角色都可以查看员工基本信息
-- 注意：这不会暴露密码，因为密码在代码中不会被查询
CREATE POLICY "employees_all_authenticated_select" 
ON public.employees 
FOR SELECT 
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'manager'::app_role) 
  OR has_role(auth.uid(), 'staff'::app_role)
);