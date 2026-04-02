-- 添加缺失的索引以加速批量操作

-- members 表：添加 created_at 索引用于按日期删除
CREATE INDEX IF NOT EXISTS idx_members_created_at ON public.members(created_at);

-- activity_gifts 表：添加索引
CREATE INDEX IF NOT EXISTS idx_activity_gifts_created_at ON public.activity_gifts(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_gifts_member_id ON public.activity_gifts(member_id);

-- member_activity 表：添加 member_id 索引（用于按 member_id 批量删除）
CREATE INDEX IF NOT EXISTS idx_member_activity_member_id ON public.member_activity(member_id);

-- referral_relations 表：添加 created_at 索引
CREATE INDEX IF NOT EXISTS idx_referral_relations_created_at ON public.referral_relations(created_at);

-- audit_records 表：添加 created_at 索引
CREATE INDEX IF NOT EXISTS idx_audit_records_created_at ON public.audit_records(created_at);

-- operation_logs 表：添加 timestamp 索引
CREATE INDEX IF NOT EXISTS idx_operation_logs_timestamp ON public.operation_logs(timestamp);

-- shift_handovers 表：添加 created_at 索引
CREATE INDEX IF NOT EXISTS idx_shift_handovers_created_at ON public.shift_handovers(created_at);

-- orders 表：添加 member_id 索引用于批量解绑
CREATE INDEX IF NOT EXISTS idx_orders_member_id ON public.orders(member_id);

-- points_ledger 表：确保有 member_id 索引（已有但确认）
CREATE INDEX IF NOT EXISTS idx_points_ledger_phone_number ON public.points_ledger(phone_number);