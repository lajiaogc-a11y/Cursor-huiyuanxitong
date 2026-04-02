-- 会员积分商城（按租户）：商品配置 + 数量兑换 + 每单/每日/终身限制

CREATE TABLE IF NOT EXISTS public.member_points_mall_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  image_url text,
  points_cost integer NOT NULL DEFAULT 0,
  stock_remaining integer NOT NULL DEFAULT -1, -- -1 表示无限
  per_order_limit integer NOT NULL DEFAULT 1,  -- 每次最多可兑换数量
  per_user_daily_limit integer NOT NULL DEFAULT 0, -- 0 表示不限制
  per_user_lifetime_limit integer NOT NULL DEFAULT 0, -- 0 表示不限制
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES public.employees(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_member_points_mall_items_tenant
  ON public.member_points_mall_items(tenant_id, enabled, sort_order, created_at DESC);

ALTER TABLE public.member_points_mall_items ENABLE ROW LEVEL SECURITY;

-- 为 redemptions 扩展商城字段（兼容旧 prize_id 流程）
ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS mall_item_id uuid REFERENCES public.member_points_mall_items(id),
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS points_used numeric,
  ADD COLUMN IF NOT EXISTS item_title text,
  ADD COLUMN IF NOT EXISTS item_image_url text,
  ADD COLUMN IF NOT EXISTS item_description text;

CREATE INDEX IF NOT EXISTS idx_redemptions_mall_item_id ON public.redemptions(mall_item_id);

CREATE OR REPLACE FUNCTION public.list_my_member_points_mall_items()
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

  SELECT e.tenant_id INTO v_tenant_id
  FROM public.employees e
  WHERE e.id = v_employee_id
  LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'TENANT_NOT_FOUND', 'items', '[]'::jsonb);
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', i.id,
        'title', i.title,
        'description', i.description,
        'image_url', i.image_url,
        'points_cost', i.points_cost,
        'stock_remaining', i.stock_remaining,
        'per_order_limit', i.per_order_limit,
        'per_user_daily_limit', i.per_user_daily_limit,
        'per_user_lifetime_limit', i.per_user_lifetime_limit,
        'enabled', i.enabled,
        'sort_order', i.sort_order
      ) ORDER BY i.sort_order ASC, i.created_at ASC
    ),
    '[]'::jsonb
  ) INTO v_rows
  FROM public.member_points_mall_items i
  WHERE i.tenant_id = v_tenant_id;

  RETURN jsonb_build_object('success', true, 'items', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_my_member_points_mall_items(p_items jsonb)
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

  DELETE FROM public.member_points_mall_items WHERE tenant_id = v_tenant_id;

  INSERT INTO public.member_points_mall_items (
    tenant_id, title, description, image_url, points_cost, stock_remaining,
    per_order_limit, per_user_daily_limit, per_user_lifetime_limit,
    enabled, sort_order, created_by, updated_at
  )
  SELECT
    v_tenant_id,
    COALESCE(NULLIF(trim(COALESCE(x.item->>'title', '')), ''), '商品'),
    NULLIF(trim(COALESCE(x.item->>'description', '')), ''),
    NULLIF(trim(COALESCE(x.item->>'image_url', '')), ''),
    GREATEST(COALESCE((x.item->>'points_cost')::integer, 0), 0),
    CASE
      WHEN COALESCE((x.item->>'stock_remaining')::integer, -1) < 0 THEN -1
      ELSE COALESCE((x.item->>'stock_remaining')::integer, 0)
    END,
    GREATEST(COALESCE((x.item->>'per_order_limit')::integer, 1), 1),
    GREATEST(COALESCE((x.item->>'per_user_daily_limit')::integer, 0), 0),
    GREATEST(COALESCE((x.item->>'per_user_lifetime_limit')::integer, 0), 0),
    COALESCE((x.item->>'enabled')::boolean, true),
    x.ord::integer,
    v_employee_id,
    now()
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS x(item, ord);

  RETURN jsonb_build_object('success', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.member_list_points_mall_items(p_member_id uuid)
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
        'id', i.id,
        'title', i.title,
        'description', i.description,
        'image_url', i.image_url,
        'points_cost', i.points_cost,
        'stock_remaining', i.stock_remaining,
        'per_order_limit', i.per_order_limit,
        'per_user_daily_limit', i.per_user_daily_limit,
        'per_user_lifetime_limit', i.per_user_lifetime_limit
      ) ORDER BY i.sort_order ASC, i.created_at ASC
    ),
    '[]'::jsonb
  ) INTO v_rows
  FROM public.member_points_mall_items i
  WHERE i.tenant_id = v_tenant_id
    AND i.enabled = true
    AND (i.stock_remaining = -1 OR i.stock_remaining > 0);

  RETURN jsonb_build_object('success', true, 'items', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.member_redeem_points_mall_item(
  p_member_id uuid,
  p_item_id uuid,
  p_quantity integer DEFAULT 1
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member members%ROWTYPE;
  v_item public.member_points_mall_items%ROWTYPE;
  v_points numeric := 0;
  v_member_code text;
  v_phone text;
  v_qty integer := GREATEST(COALESCE(p_quantity, 1), 1);
  v_daily_used integer := 0;
  v_lifetime_used integer := 0;
  v_total_cost integer := 0;
  v_status text;
BEGIN
  SELECT * INTO v_member FROM public.members WHERE id = p_member_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'MEMBER_NOT_FOUND');
  END IF;
  v_member_code := v_member.member_code;
  v_phone := v_member.phone_number;

  SELECT * INTO v_item
  FROM public.member_points_mall_items
  WHERE id = p_item_id
    AND enabled = true
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'ITEM_NOT_FOUND');
  END IF;
  IF v_item.points_cost <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_ITEM');
  END IF;
  IF v_qty > v_item.per_order_limit THEN
    RETURN jsonb_build_object('success', false, 'error', 'EXCEED_PER_ORDER_LIMIT', 'limit', v_item.per_order_limit);
  END IF;
  IF v_item.stock_remaining <> -1 AND v_item.stock_remaining < v_qty THEN
    RETURN jsonb_build_object('success', false, 'error', 'OUT_OF_STOCK', 'stock', v_item.stock_remaining);
  END IF;

  SELECT COALESCE(SUM(COALESCE(r.quantity, 1)), 0)::integer
    INTO v_daily_used
  FROM public.redemptions r
  WHERE r.member_id = p_member_id
    AND r.mall_item_id = p_item_id
    AND r.created_at::date = current_date
    AND COALESCE(r.status, 'pending') NOT IN ('cancelled', 'rejected');

  IF v_item.per_user_daily_limit > 0 AND (v_daily_used + v_qty) > v_item.per_user_daily_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'EXCEED_DAILY_LIMIT',
      'limit', v_item.per_user_daily_limit,
      'used', v_daily_used
    );
  END IF;

  SELECT COALESCE(SUM(COALESCE(r.quantity, 1)), 0)::integer
    INTO v_lifetime_used
  FROM public.redemptions r
  WHERE r.member_id = p_member_id
    AND r.mall_item_id = p_item_id
    AND COALESCE(r.status, 'pending') NOT IN ('cancelled', 'rejected');

  IF v_item.per_user_lifetime_limit > 0 AND (v_lifetime_used + v_qty) > v_item.per_user_lifetime_limit THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'EXCEED_LIFETIME_LIMIT',
      'limit', v_item.per_user_lifetime_limit,
      'used', v_lifetime_used
    );
  END IF;

  SELECT current_points INTO v_points
  FROM public.points_accounts
  WHERE member_code = v_member_code
  LIMIT 1;
  IF v_points IS NULL THEN
    SELECT remaining_points INTO v_points
    FROM public.member_activity
    WHERE member_id = p_member_id
    LIMIT 1;
    IF v_points IS NULL THEN v_points := 0; END IF;
  END IF;

  v_total_cost := v_item.points_cost * v_qty;
  IF v_points < v_total_cost THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'INSUFFICIENT_POINTS',
      'required', v_total_cost,
      'current', v_points
    );
  END IF;

  INSERT INTO public.points_ledger (
    member_code, phone_number, member_id, transaction_type, points_earned, status
  ) VALUES (
    v_member_code, v_phone, p_member_id, 'points_mall', -v_total_cost, 'issued'
  );

  UPDATE public.member_activity
  SET
    remaining_points = GREATEST(0, (remaining_points - v_total_cost)),
    accumulated_points = GREATEST(0, (accumulated_points - v_total_cost)),
    updated_at = now()
  WHERE member_id = p_member_id;

  UPDATE public.points_accounts
  SET
    current_points = GREATEST(0, (COALESCE(current_points, 0) - v_total_cost)),
    last_updated = now()
  WHERE member_code = v_member_code;

  v_status := 'pending';
  INSERT INTO public.redemptions (
    member_id, prize_id, mall_item_id, quantity, points_used, status,
    item_title, item_image_url, item_description
  ) VALUES (
    p_member_id, NULL, p_item_id, v_qty, v_total_cost, v_status,
    v_item.title, v_item.image_url, v_item.description
  );

  IF v_item.stock_remaining > 0 THEN
    UPDATE public.member_points_mall_items
    SET stock_remaining = stock_remaining - v_qty, updated_at = now()
    WHERE id = p_item_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'status', v_status,
    'quantity', v_qty,
    'points_used', v_total_cost,
    'item', jsonb_build_object(
      'id', v_item.id,
      'title', v_item.title,
      'image_url', v_item.image_url
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_member_points_mall_items() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_my_member_points_mall_items(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.member_list_points_mall_items(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_redeem_points_mall_item(uuid, uuid, integer) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
