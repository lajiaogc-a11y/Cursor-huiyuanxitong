-- 修复 get_active_employees_safe / get_active_visible_employees_safe 租户过滤
-- 租户用户仅能获取本租户员工，平台超管可获取全部或指定租户

-- ========== 1. get_active_employees_safe 增加租户过滤 ==========
CREATE OR REPLACE FUNCTION public.get_active_employees_safe(p_tenant_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, real_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT e.id, e.real_name
  FROM public.employees e
  WHERE e.status = 'active'
    AND (
      (public.is_platform_super_admin(auth.uid()) AND (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id))
      OR (NOT public.is_platform_super_admin(auth.uid()) AND e.tenant_id = (
        SELECT e2.tenant_id FROM public.profiles p2
        JOIN public.employees e2 ON e2.id = p2.employee_id
        WHERE p2.id = auth.uid() AND e2.tenant_id IS NOT NULL
        LIMIT 1
      ))
    )
  ORDER BY e.created_at ASC;
$$;

-- ========== 2. get_active_visible_employees_safe 增加租户过滤 ==========
CREATE OR REPLACE FUNCTION public.get_active_visible_employees_safe(p_tenant_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, real_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT e.id, e.real_name
  FROM public.employees e
  WHERE e.status = 'active'
    AND (e.visible = true OR e.visible IS NULL)
    AND (
      (public.is_platform_super_admin(auth.uid()) AND (p_tenant_id IS NULL OR e.tenant_id = p_tenant_id))
      OR (NOT public.is_platform_super_admin(auth.uid()) AND e.tenant_id = (
        SELECT e2.tenant_id FROM public.profiles p2
        JOIN public.employees e2 ON e2.id = p2.employee_id
        WHERE p2.id = auth.uid() AND e2.tenant_id IS NOT NULL
        LIMIT 1
      ))
    )
  ORDER BY e.created_at ASC;
$$;
