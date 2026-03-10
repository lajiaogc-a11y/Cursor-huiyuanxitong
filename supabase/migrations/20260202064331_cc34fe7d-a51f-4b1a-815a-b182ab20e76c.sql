-- 统一重新计算所有 USDT 订单的派生值
-- USDT公式：
-- - 总价值USDT = 卡价值 ÷ USDT汇率
-- - 代付价值 = 实付USDT + 手续费USDT
-- - 利润 = 总价值USDT - 代付价值
-- - 利润率 = 利润 ÷ 总价值USDT × 100%

UPDATE orders
SET 
  data_version = 2,
  -- 代付价值 = 实付USDT + 手续费USDT
  payment_value = actual_payment + COALESCE(fee, 0),
  -- 利润 = 总价值USDT - 代付价值
  -- 总价值USDT = amount / foreign_rate (amount是卡价值，foreign_rate是USDT汇率)
  profit_usdt = CASE 
    WHEN foreign_rate > 0 THEN (amount / foreign_rate) - (actual_payment + COALESCE(fee, 0))
    ELSE 0 
  END,
  -- 利润率 = 利润 ÷ 总价值USDT × 100
  profit_rate = CASE 
    WHEN foreign_rate > 0 AND amount > 0 THEN 
      (((amount / foreign_rate) - (actual_payment + COALESCE(fee, 0))) / (amount / foreign_rate)) * 100
    ELSE 0 
  END
WHERE is_deleted = false 
  AND currency = 'USDT'
  AND foreign_rate > 0
  AND actual_payment >= 0;