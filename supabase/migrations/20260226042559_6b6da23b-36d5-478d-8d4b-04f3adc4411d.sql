
CREATE TABLE public.web_vitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name text NOT NULL,
  metric_value numeric NOT NULL,
  rating text,
  navigation_type text,
  url text,
  user_agent text,
  employee_id uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.web_vitals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "web_vitals_insert" ON public.web_vitals
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "web_vitals_admin_select" ON public.web_vitals
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_web_vitals_created_at ON public.web_vitals (created_at DESC);
CREATE INDEX idx_web_vitals_metric_name ON public.web_vitals (metric_name, created_at DESC);
