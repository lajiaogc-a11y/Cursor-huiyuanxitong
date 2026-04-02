-- 补充：将 orders 表中 platform 租户的订单归属到 FastGC 租户
-- 说明：20260405000001 已迁移 members 等，但遗漏了 orders，导致 wangchao(fastgc) 登录后看不到订单

DO $$
DECLARE
  v_platform_tenant uuid := 'ed5d556a-8902-4a91-aff1-a417b5d00d99';
  v_fastgc_tenant uuid := '05307a8c-68f5-4fe4-a212-06439387dbd1';
  v_updated integer;
BEGIN
  UPDATE public.orders
  SET tenant_id = v_fastgc_tenant
  WHERE tenant_id = v_platform_tenant;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RAISE NOTICE '已将 % 条 orders 从 platform 归属到 fastgc', v_updated;
END $$;

NOTIFY pgrst, 'reload schema';
