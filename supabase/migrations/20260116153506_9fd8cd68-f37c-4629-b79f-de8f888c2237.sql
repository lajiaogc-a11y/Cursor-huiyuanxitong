
-- 修复 calculate_member_points 函数
-- 使用 > 而不是 >= 进行时间比较，确保兑换记录不会被包含在新周期中
CREATE OR REPLACE FUNCTION public.calculate_member_points(
  p_member_code text,
  p_last_reset_time timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  total_points integer;
BEGIN
  IF p_last_reset_time IS NULL THEN
    -- 没有重置时间，计算所有有效积分（只统计 issued 状态）
    SELECT COALESCE(SUM(points_earned), 0)
    INTO total_points
    FROM points_ledger
    WHERE member_code = p_member_code
      AND status = 'issued';
  ELSE
    -- 有重置时间，只计算重置时间之后的积分（只统计 issued 状态）
    -- 使用 > 而不是 >= 确保兑换记录（与 reset 同时发生）不被包含在新周期
    SELECT COALESCE(SUM(points_earned), 0)
    INTO total_points
    FROM points_ledger
    WHERE member_code = p_member_code
      AND status = 'issued'
      AND created_at > p_last_reset_time;
  END IF;
  
  -- 允许返回负数，表示积分已透支（兑换后订单被删除的情况）
  RETURN total_points;
END;
$function$;
