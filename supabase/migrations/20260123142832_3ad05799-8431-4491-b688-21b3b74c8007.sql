-- 创建安全的获取活跃且可见员工的函数
CREATE OR REPLACE FUNCTION public.get_active_visible_employees_safe()
 RETURNS TABLE(id uuid, real_name text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT e.id, e.real_name
  FROM public.employees e
  WHERE e.status = 'active'
    AND e.visible = true
  ORDER BY e.created_at ASC;
$function$;