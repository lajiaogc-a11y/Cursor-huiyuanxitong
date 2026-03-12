-- 租户员工共享数据写入 RPC：使用与 get_my_tenant_orders_full 相同的 tenant_id 解析逻辑
-- 解决 profiles.employee_id 为空时 RLS 拦截导致保存失败的问题

CREATE OR REPLACE FUNCTION public.upsert_shared_data_for_my_tenant(
  p_data_key text,
  p_data_value jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant_id uuid;
BEGIN
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
    RETURN false;
  END IF;

  INSERT INTO public.shared_data_store (tenant_id, data_key, data_value, updated_at)
  VALUES (v_tenant_id, p_data_key, p_data_value, now())
  ON CONFLICT (tenant_id, data_key)
  DO UPDATE SET data_value = EXCLUDED.data_value, updated_at = now();

  RETURN true;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.upsert_shared_data_for_my_tenant(text, jsonb) TO authenticated;
