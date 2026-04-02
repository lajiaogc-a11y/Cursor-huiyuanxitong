-- 为多租户高频查询字段添加索引，大幅提升 RLS 和按租户过滤的性能
-- employees.tenant_id：大量 RLS 策略和 RPC 通过此列关联
-- members.tenant_id：按租户过滤会员的查询
-- employees.username：登录验证查询
-- orders.creator_id：RLS 通过 creator_id 关联 employees 查 tenant_id

CREATE INDEX IF NOT EXISTS idx_employees_tenant_id ON public.employees(tenant_id);
CREATE INDEX IF NOT EXISTS idx_members_tenant_id ON public.members(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employees_username ON public.employees(username);
CREATE INDEX IF NOT EXISTS idx_orders_creator_id ON public.orders(creator_id);
