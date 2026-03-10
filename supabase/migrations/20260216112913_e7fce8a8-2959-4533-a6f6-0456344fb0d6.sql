
-- Add missing indexes for performance optimization
-- These indexes support settlement calculation queries that filter by card_merchant_id and vendor_id

-- orders: card_merchant_id (used in vendor settlement calculations)
CREATE INDEX IF NOT EXISTS idx_orders_card_merchant_id ON public.orders USING btree (card_merchant_id);

-- orders: vendor_id (used in provider settlement calculations)
CREATE INDEX IF NOT EXISTS idx_orders_vendor_id ON public.orders USING btree (vendor_id);

-- operation_logs: module + object_id (used in restore/query operations)
CREATE INDEX IF NOT EXISTS idx_operation_logs_module_object ON public.operation_logs USING btree (module, object_id);

-- operation_logs: module + operation_type (used in filtering)
CREATE INDEX IF NOT EXISTS idx_operation_logs_module_type ON public.operation_logs USING btree (module, operation_type);

-- activity_gifts: payment_agent (used in provider settlement gift calculations)
CREATE INDEX IF NOT EXISTS idx_activity_gifts_payment_agent ON public.activity_gifts USING btree (payment_agent);

-- activity_gifts: phone_number (used in member activity lookups)
CREATE INDEX IF NOT EXISTS idx_activity_gifts_phone_number ON public.activity_gifts USING btree (phone_number);

-- member_activity: phone_number (used in balance sync queries)
CREATE INDEX IF NOT EXISTS idx_member_activity_phone_number ON public.member_activity USING btree (phone_number);

-- points_ledger: composite index for calculate_member_points function
CREATE INDEX IF NOT EXISTS idx_points_ledger_member_status_created ON public.points_ledger USING btree (member_code, status, created_at);

-- ledger_transactions: composite for settlement balance queries (active + account + created_at ordering)
CREATE INDEX IF NOT EXISTS idx_ledger_active_account_created ON public.ledger_transactions USING btree (account_type, account_id, is_active, created_at DESC);
