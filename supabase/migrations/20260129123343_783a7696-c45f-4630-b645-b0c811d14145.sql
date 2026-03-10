-- 为 member_activity 表添加订单累积次数字段
-- 此字段永久存储，订单删除后不会减少，只有数据管理手动清除才会重置

ALTER TABLE public.member_activity 
ADD COLUMN IF NOT EXISTS order_count INTEGER NOT NULL DEFAULT 0;

-- 添加注释说明
COMMENT ON COLUMN public.member_activity.order_count IS '订单累积次数（永久存储，订单删除后不减少）';

-- 创建索引优化查询
CREATE INDEX IF NOT EXISTS idx_member_activity_order_count ON public.member_activity(order_count DESC);