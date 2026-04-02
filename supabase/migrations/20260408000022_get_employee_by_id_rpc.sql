-- 供后端 /api/auth/me 使用：根据 employee_id 获取员工信息
-- 使用 SECURITY DEFINER 确保 service_role 可调用
CREATE OR REPLACE FUNCTION public.get_employee_by_id(p_employee_id uuid)
RETURNS TABLE(
  employee_id uuid,
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
    e.id AS employee_id,
    e.username,
    e.real_name,
    e.role,
    e.status,
    COALESCE(e.is_super_admin, false),
    COALESCE((
      SELECT public.is_platform_super_admin(p.id)
      FROM public.profiles p
      WHERE p.employee_id = e.id
      LIMIT 1
    ), false),
    e.tenant_id
  FROM public.employees e
  WHERE e.id = p_employee_id
    AND e.status = 'active'
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_employee_by_id(uuid) TO service_role;
