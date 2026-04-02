-- 清理未使用的 RPC 函数
-- 经代码审计，以下函数在前端和后端代码中均无调用，安全删除以减少维护负担

-- ========== 1. check_my_session_revoked ==========
-- 会话控制功能从未在应用中实现。如需重新启用，可从 20260408000001 迁移恢复。
DROP FUNCTION IF EXISTS public.check_my_session_revoked(timestamptz);

-- ========== 2. force_logout_employee_sessions ==========
-- 同上，强制登出功能未集成到应用中。
DROP FUNCTION IF EXISTS public.force_logout_employee_sessions(uuid, uuid, text);

-- ========== 3. record_employee_login_failure ==========
-- 登录失败记录已由 log_employee_login + check_employee_login_lock 替代，此函数从未被调用。
DROP FUNCTION IF EXISTS public.record_employee_login_failure(text, integer, integer, integer);

-- ========== 4. rpc_phone_stats_by_employee ==========
-- 号码池统计函数，前端和后端均未调用。其他号码池 RPC（extract/consume/return/clear）仍在使用。
DROP FUNCTION IF EXISTS public.rpc_phone_stats_by_employee(uuid);

-- ========== 5. 清理关联的 employee_force_logouts 表（仅被已删除函数使用）==========
-- employee_force_logouts 表仅由 force_logout_employee_sessions 和 check_my_session_revoked 使用
-- 删除函数后此表无用途
DROP TABLE IF EXISTS public.employee_force_logouts;
