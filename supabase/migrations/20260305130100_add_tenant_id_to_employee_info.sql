-- 为 get_my_employee_info 增加 tenant_id 返回，供前端共享数据租户隔离使用

DROP FUNCTION IF EXISTS public.get_my_employee_info();
CREATE OR REPLACE FUNCTION public.get_my_employee_info()
RETURNS TABLE(
  id uuid,
  username text,
  real_name text,
  role public.app_role,
  status text,
  is_super_admin boolean,
  is_platform_super_admin boolean,
  tenant_id uuid
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
    public.is_platform_super_admin(auth.uid()),
    e.tenant_id
  FROM public.profiles p
  JOIN public.employees e ON e.id = p.employee_id
  WHERE p.id = auth.uid()
  LIMIT 1;
$$;
