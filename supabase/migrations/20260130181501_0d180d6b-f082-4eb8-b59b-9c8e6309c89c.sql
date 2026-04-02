-- 修复 calculate_member_points 函数，使其同时统计 issued 和 reversed 状态的积分
-- 规则：
-- - issued + 正数 = 积分发放
-- - reversed + 负数 = 积分回收（订单删除时创建）
-- - 净积分 = 所有 issued 和 reversed 记录的 points_earned 总和

CREATE OR REPLACE FUNCTION public.calculate_member_points(p_member_code text, p_last_reset_time timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  total_points integer;
BEGIN
  IF p_last_reset_time IS NULL THEN
    -- 没有重置时间，计算所有有效积分
    -- ⚠️ 修复：包含 issued 和 reversed 两种状态
    -- issued + 正数 = 发放，reversed + 负数 = 回收
    SELECT COALESCE(SUM(points_earned), 0)
    INTO total_points
    FROM points_ledger
    WHERE member_code = p_member_code
      AND status IN ('issued', 'reversed');
  ELSE
    -- 有重置时间，只计算重置时间之后的积分
    -- 使用 > 而不是 >= 确保兑换记录（与 reset 同时发生）不被包含在新周期
    -- ⚠️ 修复：包含 issued 和 reversed 两种状态
    SELECT COALESCE(SUM(points_earned), 0)
    INTO total_points
    FROM points_ledger
    WHERE member_code = p_member_code
      AND status IN ('issued', 'reversed')
      AND created_at > p_last_reset_time;
  END IF;
  
  -- 允许返回负数，表示积分已透支（兑换后订单被删除的情况）
  RETURN total_points;
END;
$function$;