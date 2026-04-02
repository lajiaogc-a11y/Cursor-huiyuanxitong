-- ============================================
-- 对外 API 系统 - 数据库设计
-- ============================================

-- 1. API Keys 管理表
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                          -- API Key 名称/用途说明
  key_hash TEXT NOT NULL UNIQUE,               -- API Key 哈希值（安全存储）
  key_prefix TEXT NOT NULL,                    -- Key 前缀用于识别（如 "fast_xxxx"）
  status TEXT NOT NULL DEFAULT 'active',       -- active, disabled, expired
  permissions JSONB NOT NULL DEFAULT '[]',     -- 允许访问的接口列表
  ip_whitelist TEXT[] DEFAULT NULL,            -- IP 白名单（NULL 表示不限制）
  rate_limit INTEGER NOT NULL DEFAULT 60,      -- 每分钟请求限制
  expires_at TIMESTAMPTZ DEFAULT NULL,         -- 过期时间（NULL 表示永不过期）
  last_used_at TIMESTAMPTZ DEFAULT NULL,       -- 最后使用时间
  total_requests BIGINT NOT NULL DEFAULT 0,    -- 总请求次数
  created_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  remark TEXT DEFAULT NULL
);

-- 2. API 请求日志表
CREATE TABLE public.api_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  key_prefix TEXT,                             -- 即使 key 被删除也保留前缀
  endpoint TEXT NOT NULL,                      -- 请求的接口路径
  method TEXT NOT NULL DEFAULT 'GET',          -- HTTP 方法
  ip_address TEXT,                             -- 请求者 IP
  user_agent TEXT,                             -- User Agent
  request_params JSONB DEFAULT NULL,           -- 请求参数
  response_status INTEGER NOT NULL,            -- 响应状态码
  response_time_ms INTEGER,                    -- 响应时间（毫秒）
  error_message TEXT DEFAULT NULL,             -- 错误信息
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. 频率限制追踪表（用于实时限流）
CREATE TABLE public.api_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,           -- 时间窗口开始
  request_count INTEGER NOT NULL DEFAULT 1,    -- 当前窗口请求次数
  UNIQUE(api_key_id, window_start)
);

-- 4. 创建索引优化查询性能
CREATE INDEX idx_api_keys_status ON public.api_keys(status);
CREATE INDEX idx_api_keys_key_hash ON public.api_keys(key_hash);
CREATE INDEX idx_api_request_logs_api_key ON public.api_request_logs(api_key_id);
CREATE INDEX idx_api_request_logs_created_at ON public.api_request_logs(created_at DESC);
CREATE INDEX idx_api_request_logs_endpoint ON public.api_request_logs(endpoint);
CREATE INDEX idx_api_rate_limits_key_window ON public.api_rate_limits(api_key_id, window_start);

-- 5. 启用 RLS
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

-- 6. RLS 策略 - API Keys（仅管理员可管理）
CREATE POLICY "api_keys_admin_select" ON public.api_keys
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "api_keys_admin_insert" ON public.api_keys
FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "api_keys_admin_update" ON public.api_keys
FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "api_keys_admin_delete" ON public.api_keys
FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- 7. RLS 策略 - 请求日志（管理员可查看）
CREATE POLICY "api_logs_admin_select" ON public.api_request_logs
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "api_logs_service_insert" ON public.api_request_logs
FOR INSERT WITH CHECK (true);  -- Edge Function 使用 service role 插入

-- 8. RLS 策略 - 频率限制（服务端管理）
CREATE POLICY "api_rate_limits_service_all" ON public.api_rate_limits
FOR ALL USING (true);  -- Edge Function 使用 service role

-- 9. 自动更新 updated_at
CREATE TRIGGER update_api_keys_updated_at
BEFORE UPDATE ON public.api_keys
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 10. 清理过期的频率限制记录（保留最近 2 分钟）
CREATE OR REPLACE FUNCTION public.cleanup_expired_rate_limits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.api_rate_limits 
  WHERE window_start < now() - interval '2 minutes';
END;
$$;

-- 11. 验证 API Key 并检查频率限制的函数
CREATE OR REPLACE FUNCTION public.validate_api_key(
  p_key_hash TEXT,
  p_ip_address TEXT,
  p_endpoint TEXT
)
RETURNS TABLE (
  is_valid BOOLEAN,
  api_key_id UUID,
  key_name TEXT,
  permissions JSONB,
  error_code TEXT,
  rate_remaining INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key RECORD;
  v_window_start TIMESTAMPTZ;
  v_current_count INTEGER;
BEGIN
  -- 查找 API Key
  SELECT * INTO v_key FROM public.api_keys 
  WHERE key_hash = p_key_hash LIMIT 1;
  
  -- Key 不存在
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::JSONB, 'INVALID_KEY'::TEXT, 0;
    RETURN;
  END IF;
  
  -- Key 已禁用
  IF v_key.status != 'active' THEN
    RETURN QUERY SELECT false, v_key.id, v_key.name, v_key.permissions, 'KEY_DISABLED'::TEXT, 0;
    RETURN;
  END IF;
  
  -- Key 已过期
  IF v_key.expires_at IS NOT NULL AND v_key.expires_at < now() THEN
    RETURN QUERY SELECT false, v_key.id, v_key.name, v_key.permissions, 'KEY_EXPIRED'::TEXT, 0;
    RETURN;
  END IF;
  
  -- IP 白名单检查
  IF v_key.ip_whitelist IS NOT NULL AND array_length(v_key.ip_whitelist, 1) > 0 THEN
    IF NOT (p_ip_address = ANY(v_key.ip_whitelist)) THEN
      RETURN QUERY SELECT false, v_key.id, v_key.name, v_key.permissions, 'IP_NOT_ALLOWED'::TEXT, 0;
      RETURN;
    END IF;
  END IF;
  
  -- 频率限制检查（按分钟）
  v_window_start := date_trunc('minute', now());
  
  -- 获取或创建当前窗口的计数
  INSERT INTO public.api_rate_limits (api_key_id, window_start, request_count)
  VALUES (v_key.id, v_window_start, 1)
  ON CONFLICT (api_key_id, window_start) 
  DO UPDATE SET request_count = api_rate_limits.request_count + 1
  RETURNING request_count INTO v_current_count;
  
  -- 超出频率限制
  IF v_current_count > v_key.rate_limit THEN
    RETURN QUERY SELECT false, v_key.id, v_key.name, v_key.permissions, 'RATE_LIMIT_EXCEEDED'::TEXT, 0;
    RETURN;
  END IF;
  
  -- 更新最后使用时间和总请求次数
  UPDATE public.api_keys 
  SET last_used_at = now(), total_requests = total_requests + 1
  WHERE id = v_key.id;
  
  -- 返回成功
  RETURN QUERY SELECT 
    true, 
    v_key.id, 
    v_key.name, 
    v_key.permissions, 
    NULL::TEXT,
    (v_key.rate_limit - v_current_count)::INTEGER;
END;
$$;

-- 12. 添加注释
COMMENT ON TABLE public.api_keys IS '对外 API Key 管理表';
COMMENT ON TABLE public.api_request_logs IS 'API 请求日志表，用于审计和风控';
COMMENT ON TABLE public.api_rate_limits IS 'API 频率限制追踪表';
COMMENT ON FUNCTION public.validate_api_key IS '验证 API Key 并执行频率限制检查';