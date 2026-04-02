-- 授权登录相关 RPC 给 anon，供 Backend API（使用 service_role 或 anon key）调用
-- 若 Backend 使用 service_role key 可忽略本迁移
GRANT EXECUTE ON FUNCTION public.verify_employee_login_detailed(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.log_employee_login(uuid, text, text, boolean, text) TO anon;
