
-- Create error_reports table for frontend error tracking
CREATE TABLE public.error_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  error_message TEXT NOT NULL,
  error_stack TEXT,
  component_stack TEXT,
  url TEXT,
  user_agent TEXT,
  employee_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.error_reports ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can insert errors
CREATE POLICY "Authenticated can insert error reports"
ON public.error_reports FOR INSERT
WITH CHECK (true);

-- Only admin can view error reports
CREATE POLICY "Admin can view error reports"
ON public.error_reports FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admin can delete error reports
CREATE POLICY "Admin can delete error reports"
ON public.error_reports FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));
