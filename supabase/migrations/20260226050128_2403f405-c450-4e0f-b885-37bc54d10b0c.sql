-- Fix: error_reports INSERT should be authenticated only, not public
DROP POLICY IF EXISTS "Authenticated can insert error reports" ON public.error_reports;
CREATE POLICY "Authenticated can insert error reports" ON public.error_reports FOR INSERT TO authenticated WITH CHECK (true);