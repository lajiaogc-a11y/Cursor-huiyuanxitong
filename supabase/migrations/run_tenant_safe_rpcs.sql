-- ============================================================
-- 租户隔离 RPC 迁移（不迁移任何数据，仅新增函数）
-- 两个 RPC 均严格按当前用户所属租户操作，租户数据永不跨租户
-- ============================================================

-- 1. 共享数据写入 RPC（USDT 自动更新开关等）
-- 写入时使用 auth.uid() 解析出的 tenant_id，数据仅存于该租户
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
  SELECT e.tenant_id INTO v_tenant_id
  FROM profiles p
  JOIN employees e ON e.id = p.employee_id
  WHERE p.id = auth.uid()
  LIMIT 1;

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

-- 2. 按电话查询本租户会员 RPC（计算页自动填充）
-- 仅返回 creator/recorder 属于当前用户租户的会员，永不跨租户
CREATE OR REPLACE FUNCTION public.get_member_by_phone_for_my_tenant(p_phone text)
RETURNS public.members
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tenant_id uuid;
  v_002_id uuid;
BEGIN
  IF COALESCE(trim(p_phone), '') = '' THEN
    RETURN NULL;
  END IF;

  SELECT e.tenant_id INTO v_tenant_id
  FROM profiles p
  JOIN employees e ON e.id = p.employee_id
  WHERE p.id = auth.uid()
  LIMIT 1;

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
