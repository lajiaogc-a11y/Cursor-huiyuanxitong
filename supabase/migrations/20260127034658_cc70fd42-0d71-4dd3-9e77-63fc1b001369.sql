-- 修复过于宽松的 RLS 策略
-- api_rate_limits 和 api_request_logs 需要 service role 操作，但要限制普通用户

DROP POLICY IF EXISTS "api_logs_service_insert" ON public.api_request_logs;
DROP POLICY IF EXISTS "api_rate_limits_service_all" ON public.api_rate_limits;

-- api_request_logs: 只允许通过数据库函数插入（Edge Function 使用 service role）
-- 普通用户无法直接插入
CREATE POLICY "api_logs_no_direct_insert" ON public.api_request_logs
FOR INSERT WITH CHECK (false);

-- api_rate_limits: 只允许通过数据库函数操作
CREATE POLICY "api_rate_limits_no_direct_access" ON public.api_rate_limits
FOR ALL USING (false);