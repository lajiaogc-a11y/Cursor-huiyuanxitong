-- ============================================================
-- 修复被错误标记的历史订单数据
-- 问题：导入的历史订单 data_version 被设置为 2，但 actual_payment 是人民币
-- 修复：识别这些订单，将 data_version 改为 1，重新计算 profit_ngn 和 profit_rate
-- ============================================================

-- 修复错误标记的 NGN 订单
-- 识别条件：
-- 1. data_version = 2（被错误标记为新格式）
-- 2. 直接比率合理（0.3-1.5）：actual_payment / amount
-- 3. 换算比率不合理（<0.1）：(actual_payment / foreign_rate) / amount
-- 这说明 actual_payment 本身就是人民币值，不需要换算
UPDATE orders
SET 
  data_version = 1,
  -- 重新计算利润 = 卡价值 - (actual_payment + fee)
  profit_ngn = amount - (COALESCE(actual_payment, 0) + COALESCE(fee, 0)),
  -- 重新计算利润率 = 利润 / 卡价值 × 100
  profit_rate = CASE 
    WHEN amount > 0 THEN (amount - (COALESCE(actual_payment, 0) + COALESCE(fee, 0))) / amount * 100
    ELSE 0 
  END
WHERE id IN (
  SELECT id FROM (
    SELECT 
      id,
      actual_payment / NULLIF(amount, 0) as direct_ratio,
      (actual_payment / NULLIF(foreign_rate, 1)) / NULLIF(amount, 0) as converted_ratio
    FROM orders
    WHERE data_version = 2
      AND currency = 'NGN'
      AND is_deleted = false
      AND amount > 0
      AND actual_payment > 0
      AND foreign_rate > 0
  ) sub
  WHERE direct_ratio BETWEEN 0.3 AND 1.5 
    AND converted_ratio < 0.1
);

-- 同样修复 data_version = NULL 的历史订单
UPDATE orders
SET 
  data_version = 1,
  profit_ngn = amount - (COALESCE(actual_payment, 0) + COALESCE(fee, 0)),
  profit_rate = CASE 
    WHEN amount > 0 THEN (amount - (COALESCE(actual_payment, 0) + COALESCE(fee, 0))) / amount * 100
    ELSE 0 
  END
WHERE id IN (
  SELECT id FROM (
    SELECT 
      id,
      actual_payment / NULLIF(amount, 0) as direct_ratio,
      (actual_payment / NULLIF(foreign_rate, 1)) / NULLIF(amount, 0) as converted_ratio
    FROM orders
    WHERE data_version IS NULL
      AND currency = 'NGN'
      AND is_deleted = false
      AND amount > 0
      AND actual_payment > 0
      AND foreign_rate > 0
  ) sub
  WHERE direct_ratio BETWEEN 0.3 AND 1.5 
    AND converted_ratio < 0.1
);