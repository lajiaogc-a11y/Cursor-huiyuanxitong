-- 创建员工登录日志表
CREATE TABLE public.employee_login_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  login_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ip_address TEXT,
  user_agent TEXT,
  login_method TEXT DEFAULT 'password',
  success BOOLEAN DEFAULT true,
  failure_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 创建索引
CREATE INDEX idx_login_logs_employee ON public.employee_login_logs(employee_id);
CREATE INDEX idx_login_logs_time ON public.employee_login_logs(login_time DESC);

-- 启用 RLS
ALTER TABLE public.employee_login_logs ENABLE ROW LEVEL SECURITY;

-- RLS 策略：管理员和主管可以查看所有日志
CREATE POLICY "Admin and manager can view all login logs"
ON public.employee_login_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN public.employees e ON e.id = p.employee_id
    WHERE p.id = auth.uid()
    AND e.role IN ('admin', 'manager')
  )
);

-- RLS 策略：员工只能查看自己的日志
CREATE POLICY "Staff can view own login logs"
ON public.employee_login_logs
FOR SELECT
TO authenticated
USING (
  employee_id = (SELECT employee_id FROM public.profiles WHERE id = auth.uid())
);

-- RLS 策略：允许插入登录日志（通过 RPC 函数）
CREATE POLICY "Allow insert login logs"
ON public.employee_login_logs
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 创建记录登录的函数
CREATE OR REPLACE FUNCTION public.log_employee_login(
  p_employee_id UUID,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_success BOOLEAN DEFAULT true,
  p_failure_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_log_id UUID;
BEGIN
  INSERT INTO public.employee_login_logs (
    employee_id,
    ip_address,
    user_agent,
    success,
    failure_reason
  ) VALUES (
    p_employee_id,
    p_ip_address,
    p_user_agent,
    p_success,
    p_failure_reason
  )
  RETURNING id INTO v_log_id;
  
  RETURN v_log_id;
END;
$$;