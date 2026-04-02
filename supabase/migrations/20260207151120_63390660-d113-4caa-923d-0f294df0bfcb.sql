-- 1. 新增 USDT 利润字段
ALTER TABLE member_activity 
ADD COLUMN accumulated_profit_usdt numeric DEFAULT 0;

-- 2. 添加字段注释
COMMENT ON COLUMN member_activity.accumulated_profit IS 'RMB profit from NGN/GHS orders';
COMMENT ON COLUMN member_activity.accumulated_profit_usdt IS 'USDT profit from USDT orders';

-- 3. 迁移现有数据：将只有 USDT 订单的用户利润迁移到新字段
UPDATE member_activity ma
SET 
  accumulated_profit_usdt = ma.accumulated_profit,
  accumulated_profit = 0
WHERE ma.accumulated_profit > 0
  AND EXISTS (
    SELECT 1 FROM orders o 
    WHERE o.phone_number = ma.phone_number 
      AND o.currency = 'USDT' 
      AND o.status = 'completed' 
      AND o.is_deleted = false
  )
  AND NOT EXISTS (
    SELECT 1 FROM orders o 
    WHERE o.phone_number = ma.phone_number 
      AND o.currency IN ('NGN', 'GHS') 
      AND o.status = 'completed' 
      AND o.is_deleted = false
  );