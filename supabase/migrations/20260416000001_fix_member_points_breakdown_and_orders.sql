-- 1. 修复 member_get_points_breakdown：与活动数据计算口径一致
--    活动数据包含 issued + reversed，计算净积分；原 RPC 只计 issued 正数，导致订单删除后仍显示已回收积分
CREATE OR REPLACE FUNCTION public.member_get_points_breakdown(p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_code text;
  v_phone       text;
  v_consumption numeric := 0;
  v_referral    numeric := 0;
  v_total       numeric := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM members WHERE id = p_member_id) THEN
    RETURN jsonb_build_object(
      'success', false, 'error', 'MEMBER_NOT_FOUND',
      'consumption_points', 0, 'referral_points', 0, 'total_points', 0
    );
  END IF;
  SELECT member_code, phone_number INTO v_member_code, v_phone
  FROM members WHERE id = p_member_id LIMIT 1;

  -- 消费积分：净积分 = issued 正数 + reversed 负数（与活动数据一致）
  SELECT COALESCE(SUM(points_earned), 0) INTO v_consumption
  FROM points_ledger
  WHERE (member_code = v_member_code OR (v_phone IS NOT NULL AND phone_number = v_phone))
    AND transaction_type = 'consumption'
    AND status IN ('issued', 'reversed');

  -- 推广积分：净积分 = issued 正数 + reversed 负数（与活动数据一致）
  SELECT COALESCE(SUM(points_earned), 0) INTO v_referral
  FROM points_ledger
  WHERE (member_code = v_member_code OR (v_phone IS NOT NULL AND phone_number = v_phone))
    AND transaction_type IN ('referral_1', 'referral_2', 'referral')
    AND status IN ('issued', 'reversed');

  v_total := v_consumption + v_referral;

  RETURN jsonb_build_object(
    'success', true,
    'consumption_points', v_consumption,
    'referral_points',    v_referral,
    'total_points',       v_total
  );
END;
$$;

-- 2. 会员交易记录 RPC：返回与会员相关的订单（与订单管理数据同步）
CREATE OR REPLACE FUNCTION public.member_get_orders(p_member_id uuid)
RETURNS TABLE(
  id uuid,
  created_at timestamptz,
  order_number text,
  card_type text,
  card_value numeric,
  actual_payment numeric,
  currency text,
  is_usdt boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_code text;
  v_phone       text;
  v_tenant_id   uuid;
BEGIN
  SELECT m.member_code, m.phone_number, m.tenant_id
  INTO v_member_code, v_phone, v_tenant_id
  FROM members m WHERE m.id = p_member_id LIMIT 1;
  IF v_member_code IS NULL AND v_phone IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.created_at,
    o.order_number,
    COALESCE(c.name, o.order_type::text) AS card_type,
    COALESCE(o.card_value, 0) AS card_value,
    COALESCE(o.actual_payment, 0) AS actual_payment,
    COALESCE(o.currency, '') AS currency,
    (COALESCE(o.currency, '') = 'USDT') AS is_usdt
  FROM orders o
  LEFT JOIN cards c ON c.id::text = o.order_type
  WHERE (o.is_deleted = false OR o.is_deleted IS NULL)
    AND (
      o.member_id = p_member_id
      OR (v_phone IS NOT NULL AND o.phone_number = v_phone)
      OR (v_member_code IS NOT NULL AND o.member_code_snapshot = v_member_code)
    )
    AND (
      v_tenant_id IS NULL
      OR o.tenant_id = v_tenant_id
      OR (o.tenant_id IS NULL AND (
        EXISTS (SELECT 1 FROM employees e WHERE e.id = o.creator_id AND e.tenant_id = v_tenant_id)
        OR EXISTS (SELECT 1 FROM employees e WHERE e.id = o.sales_user_id AND e.tenant_id = v_tenant_id)
      ))
    )
  ORDER BY o.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.member_get_orders(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
