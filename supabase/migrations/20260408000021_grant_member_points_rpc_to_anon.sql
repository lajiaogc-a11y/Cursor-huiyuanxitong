-- 会员端积分 RPC 对 anon 开放，供会员登录后直接调用（无需员工 JWT）
-- 修复会员登录后闪退：会员端无 api_access_token，原走后端 API 会 401
GRANT EXECUTE ON FUNCTION public.member_get_points(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.member_get_points_breakdown(uuid) TO anon, authenticated;
