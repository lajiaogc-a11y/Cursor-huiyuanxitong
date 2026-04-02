-- 积分商城订单处理（员工端）

ALTER TABLE public.redemptions
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS process_note text;

CREATE OR REPLACE FUNCTION public.list_my_member_points_mall_redemptions(
  p_status text DEFAULT NULL,
  p_limit int DEFAULT 50
)
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
        'id', q.id,
        'member_id', q.member_id,
        'member_code', q.member_code,
        'member_phone', q.member_phone,
        'item_title', q.item_title,
        'item_image_url', q.item_image_url,
        'quantity', q.quantity,
        'points_used', q.points_used,
        'status', q.status,
        'created_at', q.created_at,
        'processed_at', q.processed_at,
        'process_note', q.process_note
      ) ORDER BY q.created_at DESC
    ),
    '[]'::jsonb
  ) INTO v_rows
  FROM (
    SELECT
      r.id,
      r.member_id,
      m.member_code,
      m.phone_number AS member_phone,
      COALESCE(NULLIF(trim(COALESCE(r.item_title, '')), ''), '商城商品') AS item_title,
      r.item_image_url,
      COALESCE(r.quantity, 1) AS quantity,
      COALESCE(r.points_used, 0) AS points_used,
      COALESCE(r.status, 'pending') AS status,
      r.created_at,
      r.processed_at,
      r.process_note
    FROM public.redemptions r
    JOIN public.members m ON m.id = r.member_id
    JOIN public.member_points_mall_items i ON i.id = r.mall_item_id
    WHERE i.tenant_id = v_tenant_id
      AND (p_status IS NULL OR p_status = '' OR r.status = p_status)
    ORDER BY r.created_at DESC
    LIMIT GREATEST(COALESCE(p_limit, 50), 1)
  ) q;

  RETURN jsonb_build_object('success', true, 'items', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.process_my_member_points_mall_redemption(
  p_redemption_id uuid,
  p_action text,
  p_note text DEFAULT NULL
)
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
  v_row public.redemptions%ROWTYPE;
  v_item public.member_points_mall_items%ROWTYPE;
  v_member public.members%ROWTYPE;
  v_action text := lower(trim(COALESCE(p_action, '')));
  v_points numeric := 0;
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

  SELECT r.*
    INTO v_row
  FROM public.redemptions r
  JOIN public.member_points_mall_items i ON i.id = r.mall_item_id
  WHERE r.id = p_redemption_id
    AND i.tenant_id = v_tenant_id
  LIMIT 1
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ORDER_NOT_FOUND');
  END IF;
  IF COALESCE(v_row.status, 'pending') NOT IN ('pending', 'processing') THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_STATUS');
  END IF;

  IF v_action = 'complete' THEN
    UPDATE public.redemptions
    SET
      status = 'completed',
      processed_by = v_employee_id,
      processed_at = now(),
      process_note = NULLIF(trim(COALESCE(p_note, '')), '')
    WHERE id = v_row.id;
    RETURN jsonb_build_object('success', true, 'status', 'completed');
  END IF;

  IF v_action = 'reject' THEN
    SELECT * INTO v_member FROM public.members WHERE id = v_row.member_id LIMIT 1;
    SELECT * INTO v_item FROM public.member_points_mall_items WHERE id = v_row.mall_item_id LIMIT 1 FOR UPDATE;
    v_points := COALESCE(v_row.points_used, 0);

    IF v_points > 0 AND v_member.id IS NOT NULL THEN
      INSERT INTO public.points_ledger (
        member_code, phone_number, member_id, transaction_type, points_earned, status
      ) VALUES (
        v_member.member_code, v_member.phone_number, v_member.id, 'points_mall_refund', v_points::integer, 'issued'
      );

      UPDATE public.member_activity
      SET
        remaining_points = COALESCE(remaining_points, 0) + v_points,
        accumulated_points = COALESCE(accumulated_points, 0) + v_points,
        updated_at = now()
      WHERE member_id = v_member.id;

      UPDATE public.points_accounts
      SET
        current_points = COALESCE(current_points, 0) + v_points,
        last_updated = now()
      WHERE member_code = v_member.member_code;
    END IF;

    IF v_item.id IS NOT NULL AND v_item.stock_remaining >= 0 THEN
      UPDATE public.member_points_mall_items
      SET
        stock_remaining = stock_remaining + GREATEST(COALESCE(v_row.quantity, 1), 1),
        updated_at = now()
      WHERE id = v_item.id;
    END IF;

    UPDATE public.redemptions
    SET
      status = 'rejected',
      processed_by = v_employee_id,
      processed_at = now(),
      process_note = NULLIF(trim(COALESCE(p_note, '')), '')
    WHERE id = v_row.id;

    RETURN jsonb_build_object('success', true, 'status', 'rejected');
  END IF;

  RETURN jsonb_build_object('success', false, 'error', 'INVALID_ACTION');
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_member_points_mall_redemptions(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_my_member_points_mall_redemption(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
