-- 将历史业务数据从“平台管理占位租户”归属到 FastGC 租户
-- 说明：
-- 1) 平台超管身份相关数据（employees / role_permissions）不迁移
-- 2) 迁移业务数据，确保会员前端读取到 FastGC 的门户配置

DO $$
DECLARE
  v_platform_tenant uuid := 'ed5d556a-8902-4a91-aff1-a417b5d00d99';
  v_fastgc_tenant uuid := '05307a8c-68f5-4fe4-a212-06439387dbd1';
BEGIN
  -- 会员与会员活动（核心）
  UPDATE public.members
  SET tenant_id = v_fastgc_tenant
  WHERE tenant_id = v_platform_tenant;

  UPDATE public.member_activity
  SET tenant_id = v_fastgc_tenant
  WHERE tenant_id = v_platform_tenant;

  -- 业务配置/缓存类数据
  -- shared_data_store 可能存在同一 data_key 的唯一键冲突，先删平台侧重复键再迁移
  DELETE FROM public.shared_data_store s_platform
  USING public.shared_data_store s_fastgc
  WHERE s_platform.tenant_id = v_platform_tenant
    AND s_fastgc.tenant_id = v_fastgc_tenant
    AND s_platform.data_key = s_fastgc.data_key;

  UPDATE public.shared_data_store
  SET tenant_id = v_fastgc_tenant
  WHERE tenant_id = v_platform_tenant;

  -- navigation_config 如有同 nav_key 冲突，保留 FastGC 现有配置
  DELETE FROM public.navigation_config n_platform
  USING public.navigation_config n_fastgc
  WHERE n_platform.tenant_id = v_platform_tenant
    AND n_fastgc.tenant_id = v_fastgc_tenant
    AND n_platform.nav_key = n_fastgc.nav_key;

  UPDATE public.navigation_config
  SET tenant_id = v_fastgc_tenant
  WHERE tenant_id = v_platform_tenant;

  -- 业务日志迁移（便于后续统一按 FastGC 查看）
  UPDATE public.operation_logs
  SET tenant_id = v_fastgc_tenant
  WHERE tenant_id = v_platform_tenant;

  UPDATE public.employee_login_logs
  SET tenant_id = v_fastgc_tenant
  WHERE tenant_id = v_platform_tenant;
END $$;

NOTIFY pgrst, 'reload schema';
