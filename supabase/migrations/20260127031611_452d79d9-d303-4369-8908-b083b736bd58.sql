-- ============================================
-- 安全增强迁移
-- ============================================

-- 1. 收紧 shift_handovers 表的删除策略
-- 移除现有的过于宽松的删除策略
DROP POLICY IF EXISTS "Employees can delete shift handovers" ON public.shift_handovers;

-- 创建新的限制性删除策略：只有创建者或管理员可以删除
CREATE POLICY "shift_handovers_creator_or_admin_delete"
ON public.shift_handovers
FOR DELETE
USING (
  -- 记录创建者可以删除自己的记录
  handover_employee_id = (SELECT employee_id FROM profiles WHERE id = auth.uid())
  OR
  -- 管理员可以删除任何记录
  has_role(auth.uid(), 'admin'::app_role)
  OR
  has_role(auth.uid(), 'manager'::app_role)
);

-- 2. 为 points_ledger 添加唯一约束，防止积分重复发放
-- 注意：order_id 可能为 null（如推荐积分），所以使用部分唯一索引
-- 只对有 order_id 的记录进行唯一约束
CREATE UNIQUE INDEX IF NOT EXISTS idx_points_ledger_order_transaction_unique 
ON public.points_ledger (order_id, transaction_type) 
WHERE order_id IS NOT NULL;

-- 3. 添加注释说明
COMMENT ON INDEX idx_points_ledger_order_transaction_unique IS '防止同一订单的同一类型积分重复发放（并发安全）';