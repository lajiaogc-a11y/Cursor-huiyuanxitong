-- ============================================================
-- 修复积分回收 Bug：修改唯一索引以支持 issued 和 reversed 两种状态
-- ============================================================

-- 第一步：删除原有的阻止积分回收的唯一索引
DROP INDEX IF EXISTS idx_points_ledger_order_transaction_unique;

-- 第二步：创建新的唯一索引（包含 status 字段）
-- 规则：同一订单的同一类型可以有 issued 和 reversed 两条记录
-- 但仍然防止重复发放（同一订单不能有两条 issued 记录）
CREATE UNIQUE INDEX idx_points_ledger_order_transaction_status_unique 
ON public.points_ledger (order_id, transaction_type, status) 
WHERE order_id IS NOT NULL;

-- 第三步：修复历史脏数据 - 为已删除但未回收积分的订单补充回收记录
-- 使用 INSERT ... SELECT 批量插入负积分流水
INSERT INTO public.points_ledger (
  member_code,
  member_id,
  phone_number,
  order_id,
  transaction_type,
  actual_payment,
  currency,
  exchange_rate,
  usd_amount,
  points_multiplier,
  points_earned,
  status,
  creator_id,
  creator_name,
  created_at
)
SELECT 
  p.member_code,
  p.member_id,
  p.phone_number,
  p.order_id,
  p.transaction_type,
  p.actual_payment,
  p.currency,
  p.exchange_rate,
  p.usd_amount,
  p.points_multiplier,
  -p.points_earned,  -- 负积分
  'reversed',        -- 冲正状态
  p.creator_id,
  p.creator_name,
  now()              -- 当前时间作为回收时间
FROM public.points_ledger p
JOIN public.orders o ON o.id = p.order_id
WHERE o.is_deleted = true 
  AND o.points_status = 'reversed'
  AND p.status = 'issued'
  AND p.points_earned > 0  -- 只处理正积分（发放记录）
  AND NOT EXISTS (
    SELECT 1 FROM public.points_ledger p2 
    WHERE p2.order_id = p.order_id 
      AND p2.transaction_type = p.transaction_type
      AND p2.status = 'reversed'
  );