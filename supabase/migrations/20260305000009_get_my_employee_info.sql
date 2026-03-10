-- 获取当前登录用户的员工信息（含 is_platform_super_admin）
-- 用于区分平台总管理员与租户总管理员

CREATE OR REPLACE FUNCTION public.get_my_employee_info()
RETURNS TABLE(
  id uuid,
  username text,
  real_name text,
  role public.app_role,
  status text,
  is_super_admin boolean,
  is_platform_super_admin boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    e.id,
    e.username,
    e.real_name,
    e.role,
    e.status,
    COALESCE(e.is_super_admin, false),
    public.is_platform_super_admin(auth.uid())
  FROM public.profiles p
  JOIN public.employees e ON e.id = p.employee_id
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;
