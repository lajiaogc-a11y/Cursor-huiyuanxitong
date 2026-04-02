-- 1. Add soft deletion columns to orders table
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

-- 2. Add index for soft deletion filtering
CREATE INDEX IF NOT EXISTS idx_orders_is_deleted ON public.orders(is_deleted);

-- 3. Add comment for clarity
COMMENT ON COLUMN public.orders.is_deleted IS '软删除标记：true=已删除，false=正常';
COMMENT ON COLUMN public.orders.deleted_at IS '删除时间戳';

-- 4. Add validation trigger for points_ledger to ensure reversed status has negative points
-- Using trigger instead of CHECK constraint because we need more flexibility
CREATE OR REPLACE FUNCTION public.validate_points_ledger_entry()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate: issued must have positive points, reversed must have negative points
  IF NEW.status = 'issued' AND NEW.points_earned < 0 THEN
    RAISE EXCEPTION 'Points with status "issued" must have positive points_earned value';
  END IF;
  
  IF NEW.status = 'reversed' AND NEW.points_earned > 0 THEN
    RAISE EXCEPTION 'Points with status "reversed" must have negative points_earned value';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 5. Create trigger for validation
DROP TRIGGER IF EXISTS validate_points_ledger_trigger ON public.points_ledger;
CREATE TRIGGER validate_points_ledger_trigger
  BEFORE INSERT OR UPDATE ON public.points_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_points_ledger_entry();