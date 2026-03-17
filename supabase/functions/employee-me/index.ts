/**
 * 获取当前用户 Edge Function - 当后端未部署时作为备用
 * 验证 JWT 并返回用户信息
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import * as jose from "https://deno.land/x/jose@v5.2.0/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "");

    if (!token) {
      return new Response(JSON.stringify({ success: false, error: "未登录" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const JWT_SECRET = Deno.env.get("JWT_SECRET") || "fallback-secret-change-in-production";
    const secret = new TextEncoder().encode(JWT_SECRET);

    const { payload } = await jose.jwtVerify(token, secret);
    const p = payload as Record<string, unknown>;

    const user = {
      id: p.sub,
      username: p.username || p.sub,
      real_name: p.real_name || p.username || p.sub,
      role: p.role || "staff",
      status: p.status || "active",
      is_super_admin: Boolean(p.is_super_admin),
      is_platform_super_admin: Boolean(p.is_platform_super_admin),
      tenant_id: p.is_platform_super_admin ? null : (p.tenant_id ?? null),
    };

    return new Response(JSON.stringify({ success: true, user }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ success: false, error: "未登录" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
