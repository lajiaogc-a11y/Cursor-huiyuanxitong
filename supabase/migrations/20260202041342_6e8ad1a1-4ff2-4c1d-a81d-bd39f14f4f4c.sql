-- ============================================
-- 订单管理模块优化迁移
-- ============================================

-- 1. 添加 order_number 唯一性约束（先检查是否有重复）
-- 注意：如果有重复订单号，需要先处理
DO $$
BEGIN
  -- 检查是否已存在唯一约束
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'orders_order_number_unique'
  ) THEN
    -- 添加唯一约束
    ALTER TABLE public.orders 
    ADD CONSTRAINT orders_order_number_unique UNIQUE (order_number);
  END IF;
END $$;

-- 2. 添加 data_version 字段用于区分历史数据格式
-- v1 = 历史数据（actual_payment 存储的是人民币代付价值）
-- v2 = 新数据（actual_payment 存储的是外币金额，需要换算）
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS data_version smallint DEFAULT 2;

-- 3. 添加 member_code_snapshot 字段（会员删除后保留历史编号）
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS member_code_snapshot text;

-- 4. 添加性能优化索引
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_phone_number ON public.orders(phone_number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_member_id ON public.orders(member_id);
CREATE INDEX IF NOT EXISTS idx_orders_is_deleted ON public.orders(is_deleted);
CREATE INDEX IF NOT EXISTS idx_orders_order_type ON public.orders(order_type);
CREATE INDEX IF NOT EXISTS idx_orders_currency ON public.orders(currency);

-- 5. 复合索引：常用查询组合
CREATE INDEX IF NOT EXISTS idx_orders_deleted_created 
ON public.orders(is_deleted, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_type_deleted_created 
ON public.orders(order_type, is_deleted, created_at DESC);

-- 6. 为历史数据设置 data_version = 1（使用启发式规则）
-- 这里不自动迁移，保留 NULL 让代码层面处理
COMMENT ON COLUMN public.orders.data_version IS 
'数据版本：1=历史格式(actual_payment是人民币), 2=新格式(actual_payment是外币), NULL=未迁移需要启发式判断';