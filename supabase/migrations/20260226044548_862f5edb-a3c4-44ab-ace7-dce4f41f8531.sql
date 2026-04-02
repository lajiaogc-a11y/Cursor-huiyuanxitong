
-- ============= 综合风险评分系统 =============

-- 1. 风险事件表 - 记录所有触发风险信号的事件
CREATE TABLE IF NOT EXISTS public.risk_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid REFERENCES public.employees(id),
  event_type text NOT NULL, -- 'login_anomaly', 'order_anomaly', 'rate_anomaly', 'frequency_anomaly', 'ip_anomaly'
  severity text NOT NULL DEFAULT 'low', -- 'low', 'medium', 'high', 'critical'
  score integer NOT NULL DEFAULT 0, -- 风险分值 0-100
  details jsonb NOT NULL DEFAULT '{}',
  resolved boolean NOT NULL DEFAULT false,
  resolved_by uuid REFERENCES public.employees(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_risk_events_employee ON public.risk_events(employee_id);
CREATE INDEX idx_risk_events_created ON public.risk_events(created_at);
CREATE INDEX idx_risk_events_type ON public.risk_events(event_type);

-- 2. 风险评分快照表 - 每个员工的当前综合风险分
CREATE TABLE IF NOT EXISTS public.risk_scores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid REFERENCES public.employees(id) UNIQUE,
  current_score integer NOT NULL DEFAULT 0, -- 0-100, 越高越危险
  risk_level text NOT NULL DEFAULT 'low', -- 'low', 'medium', 'high', 'critical'
  factors jsonb NOT NULL DEFAULT '{}', -- 各维度分值明细
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  auto_action_taken text, -- 'none', 'alert', 'restrict', 'suspend'
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_risk_scores_level ON public.risk_scores(risk_level);

-- 3. RLS policies
ALTER TABLE public.risk_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.risk_scores ENABLE ROW LEVEL SECURITY;

-- Admin/Manager can view risk data
CREATE POLICY "risk_events_admin_select" ON public.risk_events FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "risk_events_employee_insert" ON public.risk_events FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "risk_events_admin_update" ON public.risk_events FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "risk_scores_admin_select" ON public.risk_scores FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "risk_scores_employee_upsert" ON public.risk_scores FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'staff'::app_role));

CREATE POLICY "risk_scores_admin_update" ON public.risk_scores FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'manager'::app_role) OR has_role(auth.uid(), 'staff'::app_role));
