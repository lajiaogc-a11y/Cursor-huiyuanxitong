-- 恢复租户 002 的所有数据
-- 背景：若曾被 repair_tenant_002_wrong_assignments 将员工移出 002，或 tenant_id 推断错误，本迁移恢复
-- 1. 确保租户 002 存在
-- 2. 将 tenant_id 为 null 的员工归属到 002
-- 3. 将曾被误移出 002 的员工移回（在 003/004/005 等租户但有订单/会员早于该租户创建时间的员工）

DO $$
DECLARE
  v_tenant_002_id uuid;
  v_updated_count int := 0;
  v_moved_back int := 0;
BEGIN
  -- ========== 1. 获取或创建租户 002 ==========
  SELECT id INTO v_tenant_002_id FROM public.tenants WHERE tenant_code = '002' LIMIT 1;
  IF v_tenant_002_id IS NULL THEN
    INSERT INTO public.tenants (tenant_code, tenant_name, status)
    VALUES ('002', '租户002', 'active')
    RETURNING id INTO v_tenant_002_id;
    RAISE NOTICE '已创建租户 002 (id: %)', v_tenant_002_id;
  END IF;

  -- ========== 2. 将 tenant_id 为 null 的员工归属到 002（排除平台总管理员）==========
  UPDATE public.employees e
  SET tenant_id = v_tenant_002_id
  WHERE e.tenant_id IS NULL
    AND (e.is_super_admin = false OR e.is_super_admin IS NULL);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE '已将 % 个 tenant_id 为 null 的员工归属到租户 002', v_updated_count;

  -- ========== 3. 将曾被误移出 002 的员工移回 ==========
  -- 条件：员工当前在 003/004/005 等（非 platform），且其有订单或会员的创建时间早于该租户创建时间
  -- 说明：这些员工在租户创建前就有业务，应归属 002（原始数据）
  WITH moved_back AS (
    UPDATE public.employees e
    SET tenant_id = v_tenant_002_id
    FROM (
      SELECT DISTINCT e2.id AS emp_id
      FROM public.employees e2
      JOIN public.tenants t ON t.id = e2.tenant_id
      WHERE t.tenant_code NOT IN ('002', 'platform')
        AND (e2.is_super_admin = false OR e2.is_super_admin IS NULL)
        AND (
          -- 有订单早于该租户创建
          EXISTS (
            SELECT 1 FROM public.orders o
            WHERE (o.creator_id = e2.id OR o.sales_user_id = e2.id)
              AND o.created_at < t.created_at
          )
          OR
          -- 有会员早于该租户创建
          EXISTS (
            SELECT 1 FROM public.members m
            WHERE (m.creator_id = e2.id OR m.recorder_id = e2.id)
              AND m.created_at < t.created_at
          )
        )
    ) sub
    WHERE e.id = sub.emp_id AND e.tenant_id != v_tenant_002_id
    RETURNING e.id
  )
  SELECT COUNT(*) INTO v_moved_back FROM moved_back;
  RAISE NOTICE '已将 % 个曾被误移出的员工移回租户 002', v_moved_back;

END $$;
