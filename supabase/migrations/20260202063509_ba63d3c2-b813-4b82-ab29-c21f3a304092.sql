-- 统一重新计算所有 NGN/GHS 订单的派生值
-- NGN: payment_value = actual_payment / foreign_rate + fee
-- GHS: payment_value = actual_payment * foreign_rate + fee

UPDATE orders
SET 
  data_version = 2,
  payment_value = CASE 
    WHEN currency = 'GHS' THEN actual_payment * foreign_rate + COALESCE(fee, 0)
    ELSE actual_payment / NULLIF(foreign_rate, 0) + COALESCE(fee, 0)
  END,
  profit_ngn = amount - (CASE 
    WHEN currency = 'GHS' THEN actual_payment * foreign_rate + COALESCE(fee, 0)
    ELSE actual_payment / NULLIF(foreign_rate, 0) + COALESCE(fee, 0)
  END),
  profit_rate = CASE 
    WHEN amount > 0 THEN 
      (amount - (CASE 
        WHEN currency = 'GHS' THEN actual_payment * foreign_rate + COALESCE(fee, 0)
        ELSE actual_payment / NULLIF(foreign_rate, 0) + COALESCE(fee, 0)
      END)) / amount * 100
    ELSE 0 
  END
WHERE is_deleted = false 
  AND currency IN ('NGN', 'GHS')
  AND foreign_rate > 0
  AND actual_payment > 0;