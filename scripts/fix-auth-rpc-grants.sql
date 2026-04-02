-- 在 Supabase 控制台 → SQL Editor 中执行此脚本
-- 授权登录相关 RPC 给 anon（若 Backend 暂时使用 anon key 时需执行）
-- 推荐做法：在 server/.env 中配置 SUPABASE_SERVICE_ROLE_KEY，无需执行本脚本
GRANT EXECUTE ON FUNCTION public.verify_employee_login_detailed(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.log_employee_login(uuid, text, text, boolean, text) TO anon;
