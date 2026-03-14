-- 抽奖命中率改为百分比配置，并强制启用奖品总和 = 100%

CREATE OR REPLACE FUNCTION public.upsert_my_member_spin_wheel_prizes(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
  v_tenant_id uuid;
  v_role text;
  v_is_super_admin boolean;
  v_count int;
  v_enabled_count int;
  v_total_rate numeric;
  v_invalid_rate_count int;
BEGIN
  v_employee_id := public.resolve_current_employee_id();
  IF v_employee_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED');
  END IF;

  SELECT e.tenant_id, e.role, COALESCE(e.is_super_admin, false)
    INTO v_tenant_id, v_role, v_is_super_admin
  FROM public.employees e
  WHERE e.id = v_employee_id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'TENANT_NOT_FOUND');
  END IF;

  IF v_role NOT IN ('admin', 'manager') AND NOT v_is_super_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_PERMISSION');
  END IF;

  IF jsonb_typeof(COALESCE(p_items, '[]'::jsonb)) <> 'array' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_ITEMS');
  END IF;

  v_count := jsonb_array_length(COALESCE(p_items, '[]'::jsonb));
  IF v_count < 6 OR v_count > 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'ITEM_COUNT_OUT_OF_RANGE');
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE COALESCE((x.item->>'enabled')::boolean, true))::int,
    COUNT(*) FILTER (
      WHERE GREATEST(COALESCE((x.item->>'hit_rate')::numeric, 0), 0) > 100
         OR GREATEST(COALESCE((x.item->>'hit_rate')::numeric, 0), 0) < 0
    )::int,
    COALESCE(SUM(
      CASE
        WHEN COALESCE((x.item->>'enabled')::boolean, true)
        THEN GREATEST(COALESCE((x.item->>'hit_rate')::numeric, 0), 0)
        ELSE 0
      END
    ), 0)
  INTO v_enabled_count, v_invalid_rate_count, v_total_rate
  FROM jsonb_array_elements(p_items) AS x(item);

  IF v_enabled_count < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'ENABLED_ITEMS_TOO_FEW');
  END IF;

  IF v_invalid_rate_count > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'HIT_RATE_OUT_OF_RANGE');
  END IF;

  IF ABS(v_total_rate - 100) > 0.0001 THEN
    RETURN jsonb_build_object('success', false, 'error', 'RATE_SUM_NOT_100');
  END IF;

  DELETE FROM public.member_spin_wheel_prizes
  WHERE tenant_id = v_tenant_id;

  INSERT INTO public.member_spin_wheel_prizes (
    tenant_id, name, prize_type, hit_rate, sort_order, enabled, created_by, updated_at
  )
  SELECT
    v_tenant_id,
    COALESCE(NULLIF(trim(COALESCE(x.item->>'name', '')), ''), '奖品'),
    COALESCE(NULLIF(trim(COALESCE(x.item->>'prize_type', '')), ''), 'custom'),
    LEAST(100, GREATEST(COALESCE((x.item->>'hit_rate')::numeric, 0), 0)),
    x.ord::int,
    COALESCE((x.item->>'enabled')::boolean, true),
    v_employee_id,
    now()
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS x(item, ord);

  RETURN jsonb_build_object('success', true);
END;
$$;

NOTIFY pgrst, 'reload schema';
