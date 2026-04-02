-- 无参 RPC：使用 get_my_tenant_id() 解析租户，供 profiles.employee_id 为空或前端未传 tenant 时使用
CREATE OR REPLACE FUNCTION rpc_get_my_tenant_phone_stats()
RETURNS TABLE(
  total_available INT,
  total_reserved INT,
  user_today_extracted INT,
  user_today_extract_actions INT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid := public.get_my_tenant_id();
BEGIN
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id_required';
  END IF;
  RETURN QUERY SELECT * FROM rpc_phone_stats(v_tenant_id);
END;
$$;

COMMENT ON FUNCTION rpc_get_my_tenant_phone_stats() IS 'Phone pool stats for current user tenant (no params, uses get_my_tenant_id)';

GRANT EXECUTE ON FUNCTION public.rpc_get_my_tenant_phone_stats() TO authenticated;
