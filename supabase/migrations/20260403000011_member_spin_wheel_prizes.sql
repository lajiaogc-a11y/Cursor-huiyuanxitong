-- 会员抽奖转盘：支持按租户配置 6~10 个奖品与命中率

CREATE TABLE IF NOT EXISTS public.member_spin_wheel_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  prize_type text NOT NULL DEFAULT 'custom',
  hit_rate numeric NOT NULL DEFAULT 1,
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_spin_wheel_prizes_tenant
  ON public.member_spin_wheel_prizes(tenant_id, enabled, sort_order, created_at);

CREATE OR REPLACE FUNCTION public.list_my_member_spin_wheel_prizes()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee_id uuid;
  v_tenant_id uuid;
  v_rows jsonb;
BEGIN
  v_employee_id := public.resolve_current_employee_id();
  IF v_employee_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED', 'items', '[]'::jsonb);
  END IF;

  SELECT e.tenant_id
    INTO v_tenant_id
  FROM public.employees e
  WHERE e.id = v_employee_id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'TENANT_NOT_FOUND', 'items', '[]'::jsonb);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.member_spin_wheel_prizes p
    WHERE p.tenant_id = v_tenant_id
  ) THEN
    INSERT INTO public.member_spin_wheel_prizes (tenant_id, name, prize_type, hit_rate, sort_order, enabled, created_by)
    SELECT
      v_tenant_id,
      src.name,
      src.prize_type,
      src.hit_rate,
      src.sort_order,
      true,
      v_employee_id
    FROM (
      VALUES
        ('积分', 'points', 1::numeric, 1),
        ('话费', 'airtime', 1::numeric, 2),
        ('现金', 'cash', 1::numeric, 3),
        ('抽奖', 'spin', 1::numeric, 4),
        ('积分', 'points', 1::numeric, 5),
        ('话费', 'airtime', 1::numeric, 6)
    ) AS src(name, prize_type, hit_rate, sort_order);
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'prize_type', p.prize_type,
        'hit_rate', p.hit_rate,
        'sort_order', p.sort_order,
        'enabled', p.enabled
      ) ORDER BY p.sort_order ASC, p.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM public.member_spin_wheel_prizes p
  WHERE p.tenant_id = v_tenant_id;

  RETURN jsonb_build_object('success', true, 'items', v_rows);
END;
$$;

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
    COUNT(*)::int,
    COALESCE(SUM(
      CASE
        WHEN COALESCE((x.item->>'enabled')::boolean, true)
        THEN GREATEST(COALESCE((x.item->>'hit_rate')::numeric, 0), 0)
        ELSE 0
      END
    ), 0)
  INTO v_enabled_count, v_total_rate
  FROM jsonb_array_elements(p_items) AS x(item);

  IF v_enabled_count < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'ENABLED_ITEMS_TOO_FEW');
  END IF;
  IF v_total_rate <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_HIT_RATE');
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
    GREATEST(COALESCE((x.item->>'hit_rate')::numeric, 0), 0),
    x.ord::int,
    COALESCE((x.item->>'enabled')::boolean, true),
    v_employee_id,
    now()
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS x(item, ord);

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.member_get_spin_wheel_prizes(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_rows jsonb;
BEGIN
  v_tenant_id := public.member_resolve_tenant_id(p_member_id);

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'items', '[]'::jsonb);
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'name', p.name,
        'prize_type', p.prize_type,
        'hit_rate', p.hit_rate
      ) ORDER BY p.sort_order ASC, p.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_rows
  FROM public.member_spin_wheel_prizes p
  WHERE p.tenant_id = v_tenant_id
    AND p.enabled = true;

  RETURN jsonb_build_object('success', true, 'items', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.member_spin(p_member_id uuid, p_source text DEFAULT 'daily_free')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prize prizes%ROWTYPE;
  v_prizes prizes%ROWTYPE[];
  v_idx int;
  v_cnt int;
  v_earned numeric := 0;
  v_credits int := 0;
  v_used bigint := 0;
  v_remaining int;
  v_tenant_id uuid;
  v_settings public.member_portal_settings%ROWTYPE;
  v_wheel_rows public.member_spin_wheel_prizes%ROWTYPE[];
  v_wheel public.member_spin_wheel_prizes%ROWTYPE;
  v_total_rate numeric := 0;
  v_rand numeric := 0;
  v_acc_rate numeric := 0;
  v_result_name text;
  v_result_type text;
  v_result_prize_id uuid;
BEGIN
  v_tenant_id := public.member_resolve_tenant_id(p_member_id);
  IF v_tenant_id IS NOT NULL THEN
    SELECT * INTO v_settings FROM public.member_portal_settings WHERE tenant_id = v_tenant_id LIMIT 1;
    IF COALESCE(v_settings.enable_spin, true) = false THEN
      RETURN jsonb_build_object('success', false, 'error', 'SPIN_DISABLED');
    END IF;
  END IF;

  SELECT COALESCE(SUM(reward_value), 0) INTO v_earned
  FROM check_ins
  WHERE member_id = p_member_id AND reward_type = 'spin';

  SELECT COALESCE(SUM(credits), 0)::int INTO v_credits
  FROM spin_credits
  WHERE member_id = p_member_id;

  SELECT COUNT(*) INTO v_used FROM spins WHERE member_id = p_member_id;
  v_remaining := GREATEST(0, ((v_earned + v_credits)::bigint - v_used)::int);

  IF v_remaining <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_SPIN_QUOTA', 'remaining', 0);
  END IF;

  -- 先按租户转盘配置（命中率）抽奖
  IF v_tenant_id IS NOT NULL THEN
    SELECT array_agg(w ORDER BY w.sort_order, w.created_at)
      INTO v_wheel_rows
    FROM public.member_spin_wheel_prizes w
    WHERE w.tenant_id = v_tenant_id
      AND w.enabled = true
      AND w.hit_rate > 0;

    IF v_wheel_rows IS NOT NULL AND array_length(v_wheel_rows, 1) IS NOT NULL THEN
      FOREACH v_wheel IN ARRAY v_wheel_rows LOOP
        v_total_rate := v_total_rate + COALESCE(v_wheel.hit_rate, 0);
      END LOOP;

      IF v_total_rate > 0 THEN
        v_rand := random() * v_total_rate;
        v_acc_rate := 0;
        FOREACH v_wheel IN ARRAY v_wheel_rows LOOP
          v_acc_rate := v_acc_rate + COALESCE(v_wheel.hit_rate, 0);
          IF v_rand <= v_acc_rate THEN
            v_result_name := v_wheel.name;
            v_result_type := v_wheel.prize_type;
            v_result_prize_id := NULL;
            EXIT;
          END IF;
        END LOOP;
      END IF;
    END IF;
  END IF;

  -- 回退逻辑：旧 prizes 表随机
  IF COALESCE(v_result_name, '') = '' THEN
    SELECT array_agg(p ORDER BY p.name) INTO v_prizes FROM prizes p WHERE stock = -1 OR stock > 0;
    IF v_prizes IS NULL OR array_length(v_prizes, 1) IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error', 'NO_PRIZES');
    END IF;
    v_cnt := array_length(v_prizes, 1);
    v_idx := 1 + floor(random() * v_cnt)::int;
    v_prize := v_prizes[v_idx];
    v_result_name := v_prize.name;
    v_result_type := v_prize.type;
    v_result_prize_id := v_prize.id;

    IF v_prize.stock > 0 THEN
      UPDATE prizes SET stock = stock - 1 WHERE id = v_prize.id;
    END IF;
  END IF;

  INSERT INTO spins (member_id, spin_type, source, result, prize_id, status)
  VALUES (p_member_id, 'wheel', p_source, v_result_name, v_result_prize_id, 'issued');

  RETURN jsonb_build_object(
    'success', true,
    'remaining', v_remaining - 1,
    'prize', jsonb_build_object('id', v_result_prize_id, 'name', v_result_name, 'type', v_result_type)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_member_spin_wheel_prizes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_my_member_spin_wheel_prizes(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_get_spin_wheel_prizes(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
