-- Add creator_id column to shift_receivers to enable per-user visibility
ALTER TABLE public.shift_receivers 
ADD COLUMN IF NOT EXISTS creator_id uuid REFERENCES public.employees(id);

-- Create index for efficient lookup by creator
CREATE INDEX IF NOT EXISTS idx_shift_receivers_creator_id ON public.shift_receivers(creator_id);

-- Drop existing policies
DROP POLICY IF EXISTS "Employees can manage shift receivers" ON public.shift_receivers;
DROP POLICY IF EXISTS "shift_receivers_authenticated_select" ON public.shift_receivers;
DROP POLICY IF EXISTS "shift_receivers_authenticated_insert" ON public.shift_receivers;
DROP POLICY IF EXISTS "shift_receivers_authenticated_update" ON public.shift_receivers;
DROP POLICY IF EXISTS "shift_receivers_authenticated_delete" ON public.shift_receivers;

-- Create new RLS policies for per-user visibility
-- Users can only see receivers they created
CREATE POLICY "shift_receivers_select_own"
ON public.shift_receivers
FOR SELECT
USING (
  creator_id = (SELECT employee_id FROM public.profiles WHERE id = auth.uid())
);

-- Users can only insert receivers with their own employee ID
CREATE POLICY "shift_receivers_insert_own"
ON public.shift_receivers
FOR INSERT
WITH CHECK (
  creator_id = (SELECT employee_id FROM public.profiles WHERE id = auth.uid())
);

-- Users can only update their own receivers
CREATE POLICY "shift_receivers_update_own"
ON public.shift_receivers
FOR UPDATE
USING (
  creator_id = (SELECT employee_id FROM public.profiles WHERE id = auth.uid())
);

-- Users can only delete their own receivers
CREATE POLICY "shift_receivers_delete_own"
ON public.shift_receivers
FOR DELETE
USING (
  creator_id = (SELECT employee_id FROM public.profiles WHERE id = auth.uid())
);