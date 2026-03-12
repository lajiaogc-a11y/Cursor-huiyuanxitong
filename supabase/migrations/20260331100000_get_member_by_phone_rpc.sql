-- 按电话号码查询本租户会员：使用与 get_my_tenant_orders_full 相同的 tenant_id 解析逻辑
-- 解决 profiles.employee_id 为空时 RLS 拦截导致计算页无法自动填充会员数据的问题

CREATE OR REPLACE FUNCTION public.get_member_by_phone_for_my_tenant(p_phone text)
RETURNS public.members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant_id uuid;
  v_002_id uuid;
  v_member public.members%ROWTYPE;
BEGIN
  IF COALESCE(trim(p_phone), '') = '' THEN
    RETURN NULL;
  END IF;

  -- 优先：profiles.employee_id → employees.tenant_id
  SELECT e.tenant_id INTO v_tenant_id
  FROM profiles p
  JOIN employees e ON e.id = p.employee_id
  WHERE p.id = auth.uid()
  LIMIT 1;

  -- 兜底：profile 无 employee_id 时，用 profile.email 前缀匹配 employees.username
  IF v_tenant_id IS NULL THEN
    SELECT e.tenant_id INTO v_tenant_id
    FROM profiles p
    JOIN employees e ON e.username = split_part(COALESCE(p.email, ''), '@', 1)
    WHERE p.id = auth.uid() AND COALESCE(p.email, '') != ''
    LIMIT 1;
  END IF;

  IF v_tenant_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT id INTO v_002_id FROM public.tenants WHERE tenant_code = '002' LIMIT 1;

  IF v_tenant_id = v_002_id THEN
    RETURN (SELECT m FROM public.members m WHERE m.phone_number = trim(p_phone) LIMIT 1);
  ELSE
    RETURN (
      SELECT m FROM public.members m
      WHERE m.phone_number = trim(p_phone)
        AND (
          EXISTS (SELECT 1 FROM employees e WHERE e.id = m.creator_id AND e.tenant_id = v_tenant_id)
          OR EXISTS (SELECT 1 FROM employees e WHERE e.id = m.recorder_id AND e.tenant_id = v_tenant_id)
        )
      LIMIT 1
    );
  END IF;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_member_by_phone_for_my_tenant(text) TO authenticated;
