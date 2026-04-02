-- 添加性能优化索引
-- 减少 vendors, payment_providers, cards 表的顺序扫描

-- vendors 表索引
CREATE INDEX IF NOT EXISTS idx_vendors_status ON public.vendors(status);
CREATE INDEX IF NOT EXISTS idx_vendors_sort_order ON public.vendors(sort_order);
CREATE INDEX IF NOT EXISTS idx_vendors_name ON public.vendors(name);

-- payment_providers 表索引
CREATE INDEX IF NOT EXISTS idx_payment_providers_status ON public.payment_providers(status);
CREATE INDEX IF NOT EXISTS idx_payment_providers_sort_order ON public.payment_providers(sort_order);
CREATE INDEX IF NOT EXISTS idx_payment_providers_name ON public.payment_providers(name);

-- cards 表索引
CREATE INDEX IF NOT EXISTS idx_cards_status ON public.cards(status);
CREATE INDEX IF NOT EXISTS idx_cards_sort_order ON public.cards(sort_order);
CREATE INDEX IF NOT EXISTS idx_cards_name ON public.cards(name);

-- orders 表常用查询索引
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_phone_number ON public.orders(phone_number);
CREATE INDEX IF NOT EXISTS idx_orders_is_deleted ON public.orders(is_deleted);

-- members 表索引
CREATE INDEX IF NOT EXISTS idx_members_phone_number ON public.members(phone_number);
CREATE INDEX IF NOT EXISTS idx_members_member_code ON public.members(member_code);

-- points_ledger 表索引
CREATE INDEX IF NOT EXISTS idx_points_ledger_member_code ON public.points_ledger(member_code);
CREATE INDEX IF NOT EXISTS idx_points_ledger_created_at ON public.points_ledger(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_points_ledger_status ON public.points_ledger(status);