-- ============================================
-- Webhook 推送系统 + API 统计（修复版）
-- ============================================

-- 1. Webhook 配置表
CREATE TABLE IF NOT EXISTS public.webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT,
  events TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  headers JSONB DEFAULT '{}',
  retry_count INTEGER NOT NULL DEFAULT 3,
  timeout_ms INTEGER NOT NULL DEFAULT 5000,
  last_triggered_at TIMESTAMPTZ,
  total_deliveries BIGINT NOT NULL DEFAULT 0,
  successful_deliveries BIGINT NOT NULL DEFAULT 0,
  failed_deliveries BIGINT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  remark TEXT
);

-- 2. Webhook 投递日志表
CREATE TABLE IF NOT EXISTS public.webhook_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID REFERENCES public.webhooks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  response_time_ms INTEGER,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Webhook 事件队列表
CREATE TABLE IF NOT EXISTS public.webhook_event_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- 4. 创建索引（不使用 DATE 函数）
CREATE INDEX IF NOT EXISTS idx_webhooks_status ON public.webhooks(status);
CREATE INDEX IF NOT EXISTS idx_webhooks_events ON public.webhooks USING GIN(events);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_webhook ON public.webhook_delivery_logs(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_delivery_logs_created ON public.webhook_delivery_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_event_queue_status ON public.webhook_event_queue(status);
CREATE INDEX IF NOT EXISTS idx_webhook_event_queue_next_retry ON public.webhook_event_queue(next_retry_at) WHERE status = 'pending';

-- 5. 启用 RLS
ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_event_queue ENABLE ROW LEVEL SECURITY;

-- 6. RLS 策略
DROP POLICY IF EXISTS "webhooks_admin_all" ON public.webhooks;
CREATE POLICY "webhooks_admin_all" ON public.webhooks
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "webhook_logs_admin_select" ON public.webhook_delivery_logs;
CREATE POLICY "webhook_logs_admin_select" ON public.webhook_delivery_logs
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "webhook_logs_service_insert" ON public.webhook_delivery_logs;
CREATE POLICY "webhook_logs_service_insert" ON public.webhook_delivery_logs
FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "webhook_queue_service_all" ON public.webhook_event_queue;
CREATE POLICY "webhook_queue_service_all" ON public.webhook_event_queue
FOR ALL USING (false);

-- 7. 自动更新触发器
DROP TRIGGER IF EXISTS update_webhooks_updated_at ON public.webhooks;
CREATE TRIGGER update_webhooks_updated_at
BEFORE UPDATE ON public.webhooks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. API 统计函数
CREATE OR REPLACE FUNCTION public.get_api_daily_stats(p_days INTEGER DEFAULT 7)
RETURNS TABLE (
  stat_date DATE,
  total_requests BIGINT,
  successful_requests BIGINT,
  failed_requests BIGINT,
  error_rate NUMERIC,
  avg_response_time NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    DATE(created_at) as stat_date,
    COUNT(*)::BIGINT as total_requests,
    COUNT(*) FILTER (WHERE response_status >= 200 AND response_status < 400)::BIGINT as successful_requests,
    COUNT(*) FILTER (WHERE response_status >= 400)::BIGINT as failed_requests,
    ROUND((COUNT(*) FILTER (WHERE response_status >= 400)::NUMERIC / NULLIF(COUNT(*), 0) * 100), 2) as error_rate,
    ROUND(AVG(response_time_ms)::NUMERIC, 2) as avg_response_time
  FROM public.api_request_logs
  WHERE created_at >= CURRENT_DATE - p_days
  GROUP BY DATE(created_at)
  ORDER BY DATE(created_at) DESC;
END;
$$;

-- 9. 按端点统计函数
CREATE OR REPLACE FUNCTION public.get_api_endpoint_stats(p_days INTEGER DEFAULT 7)
RETURNS TABLE (
  endpoint TEXT,
  total_requests BIGINT,
  successful_requests BIGINT,
  failed_requests BIGINT,
  avg_response_time NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    l.endpoint,
    COUNT(*)::BIGINT as total_requests,
    COUNT(*) FILTER (WHERE l.response_status >= 200 AND l.response_status < 400)::BIGINT as successful_requests,
    COUNT(*) FILTER (WHERE l.response_status >= 400)::BIGINT as failed_requests,
    ROUND(AVG(l.response_time_ms)::NUMERIC, 2) as avg_response_time
  FROM public.api_request_logs l
  WHERE l.created_at >= CURRENT_DATE - p_days
  GROUP BY l.endpoint
  ORDER BY COUNT(*) DESC;
END;
$$;

-- 10. Webhook 事件入队函数
CREATE OR REPLACE FUNCTION public.queue_webhook_event(p_event_type TEXT, p_payload JSONB)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID;
BEGIN
  INSERT INTO public.webhook_event_queue (event_type, payload)
  VALUES (p_event_type, p_payload)
  RETURNING id INTO v_event_id;
  RETURN v_event_id;
END;
$$;