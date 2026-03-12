-- Phone Extractor: admin-only RPCs (clear pool, update settings)
-- Restrict rpc_clear_phone_pool to admin/manager; add rpc_update_phone_extract_settings

-- Admin only: clear pool for tenant (tenant admin/manager or platform super admin)
CREATE OR REPLACE FUNCTION rpc_clear_phone_pool(p_tenant_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.is_platform_super_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'forbidden_admin_only';
  END IF;
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_required';
  END IF;
  -- Platform super admin can clear any tenant; others only own tenant
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    IF p_tenant_id != public.get_my_tenant_id() THEN
      RAISE EXCEPTION 'forbidden_tenant_mismatch';
    END IF;
  END IF;
  DELETE FROM phone_reservations WHERE phone_pool_id IN (SELECT id FROM phone_pool WHERE tenant_id = p_tenant_id);
  DELETE FROM phone_pool WHERE tenant_id = p_tenant_id;
END;
$$;

-- Admin only: update extract settings (per_extract_limit, per_user_daily_limit)
CREATE OR REPLACE FUNCTION rpc_update_phone_extract_settings(
  p_per_extract_limit INT DEFAULT NULL,
  p_per_user_daily_limit INT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'manager'::app_role)
    OR public.is_platform_super_admin(auth.uid())
  ) THEN
    RAISE EXCEPTION 'forbidden_admin_only';
  END IF;
  UPDATE phone_extract_settings
  SET
    per_extract_limit = CASE
      WHEN p_per_extract_limit IS NOT NULL AND p_per_extract_limit >= 1 AND p_per_extract_limit <= 10000
      THEN p_per_extract_limit ELSE per_extract_limit END,
    per_user_daily_limit = CASE
      WHEN p_per_user_daily_limit IS NOT NULL AND p_per_user_daily_limit >= 1 AND p_per_user_daily_limit <= 1000
      THEN p_per_user_daily_limit ELSE per_user_daily_limit END
  WHERE id = 1;
END;
$$;
