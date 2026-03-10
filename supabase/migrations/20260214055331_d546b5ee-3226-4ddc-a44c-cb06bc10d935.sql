-- Drop the overly restrictive unique constraint that prevents points adjustments
-- The system needs to insert multiple consumption entries per order (original + delta adjustments)
DROP INDEX IF EXISTS idx_points_ledger_order_transaction_status_unique;