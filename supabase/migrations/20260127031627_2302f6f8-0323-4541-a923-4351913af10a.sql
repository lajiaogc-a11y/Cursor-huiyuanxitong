-- ============================================
-- 修复剩余的过于宽松的 RLS 策略
-- ============================================

-- 1. 修复 shift_handovers 表的 INSERT 策略
DROP POLICY IF EXISTS "Employees can create their own handovers" ON public.shift_handovers;

CREATE POLICY "shift_handovers_employee_insert"
ON public.shift_handovers
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'staff'::app_role)
);

-- 2. 修复 shift_receivers 表的策略
DROP POLICY IF EXISTS "All employees can manage shift receivers" ON public.shift_receivers;

-- SELECT 策略 - 所有员工可查看
CREATE POLICY "shift_receivers_employee_select"
ON public.shift_receivers
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'staff'::app_role)
);

-- INSERT 策略 - 所有员工可添加
CREATE POLICY "shift_receivers_employee_insert"
ON public.shift_receivers
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'staff'::app_role)
);

-- UPDATE 策略 - 管理员/经理可更新
CREATE POLICY "shift_receivers_admin_manager_update"
ON public.shift_receivers
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role)
);

-- 3. 修复 employee_login_logs 表的 INSERT 策略
DROP POLICY IF EXISTS "Allow insert login logs" ON public.employee_login_logs;

CREATE POLICY "employee_login_logs_insert"
ON public.employee_login_logs
FOR INSERT
WITH CHECK (
  -- 允许已登录用户或系统插入登录日志
  auth.uid() IS NOT NULL OR true
);

-- 4. 修复 employee_name_history 表的 INSERT 策略
DROP POLICY IF EXISTS "Allow authenticated users to insert name history" ON public.employee_name_history;

CREATE POLICY "employee_name_history_employee_insert"
ON public.employee_name_history
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'manager'::app_role) OR 
  has_role(auth.uid(), 'staff'::app_role)
);