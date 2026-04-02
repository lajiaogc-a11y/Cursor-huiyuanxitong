-- 修复历史订单的 actual_payment 值
-- 这些订单的 actual_payment 实际存储的是人民币代付价值，需要转换回外币值
-- 识别条件：actual_payment / cardWorth 比率在 0.5-1.5 之间（说明是人民币值）
-- 且 actual_payment / foreign_rate / cardWorth < 0.1（说明不是外币值）

-- 修复方式：actual_payment_new = (actual_payment_old - fee) * foreign_rate
-- 这样再用公式计算时：payment_value = actual_payment_new / foreign_rate + fee = actual_payment_old

UPDATE orders
SET 
  actual_payment = CASE 
    WHEN currency = 'GHS' THEN (actual_payment - fee) / NULLIF(foreign_rate, 0)
    ELSE (actual_payment - fee) * foreign_rate
  END
WHERE is_deleted = false 
  AND currency IN ('NGN', 'GHS')
  AND amount > 0
  AND actual_payment > 0
  AND foreign_rate > 0
  -- 识别历史数据：直接比率合理(0.3-1.5) 且 换算比率不合理(<0.15)
  AND (actual_payment / amount) BETWEEN 0.3 AND 1.5
  AND (actual_payment / foreign_rate / amount) < 0.15;