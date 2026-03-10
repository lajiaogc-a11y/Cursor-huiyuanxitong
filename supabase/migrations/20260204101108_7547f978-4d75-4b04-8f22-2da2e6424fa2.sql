-- 修复 validate_api_key 函数的列名歧义问题
-- 问题：INSERT 语句中的 api_key_id 与返回表的列名冲突
-- 解决：使用表别名 AS arl 明确指定列引用

CREATE OR REPLACE FUNCTION public.validate_api_key(
  p_key_hash TEXT,
  p_ip_address TEXT,
  p_endpoint TEXT
)
RETURNS TABLE(
  is_valid BOOLEAN,
  api_key_id UUID,
  key_name TEXT,
  permissions JSONB,
  error_code TEXT,
  rate_remaining INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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
  
  -- 【关键修复】使用表别名 arl 避免列名歧义
  INSERT INTO public.api_rate_limits AS arl (api_key_id, window_start, request_count)
  VALUES (v_key.id, v_window_start, 1)
  ON CONFLICT (api_key_id, window_start) 
  DO UPDATE SET request_count = arl.request_count + 1
  RETURNING arl.request_count INTO v_current_count;
  
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