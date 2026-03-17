/**
 * 员工登录 Edge Function - 当后端未部署时作为备用
 * 与 server 的 /api/auth/login 返回格式一致
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";
import * as jose from "https://deno.land/x/jose@v5.2.0/index.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = { username?: string; password?: string };

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ success: false, error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const JWT_SECRET = Deno.env.get("JWT_SECRET") || "fallback-secret-change-in-production";

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ success: false, error: "后端未配置" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = (await req.json().catch(() => ({}))) as Body;
    const username = (body.username || "").trim();
    const password = body.password || "";

    if (!username || !password) {
      return new Response(JSON.stringify({ success: false, error: "用户名和密码不能为空" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: verifyData, error: verifyError } = await supabaseAdmin.rpc("verify_employee_login_detailed", {
      p_username: username,
      p_password: password,
    });

    if (verifyError) {
      const msg = (verifyError.message || "").toLowerCase();
      if (msg.includes("permission") || msg.includes("denied") || msg.includes("jwt") || msg.includes("rpc")) {
        return new Response(JSON.stringify({ success: false, error: "后端配置错误，请配置 SUPABASE_SERVICE_ROLE_KEY" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ success: false, error: "系统繁忙，请稍后重试" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const arr = Array.isArray(verifyData) ? verifyData : verifyData ? [verifyData] : [];
    const result = arr[0] as Record<string, unknown> | undefined;

    if (!result) {
      return new Response(JSON.stringify({ success: false, error: "验证失败，请稍后重试" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const errorCode = result.error_code as string | undefined;
    if (errorCode === "USER_NOT_FOUND") {
      return new Response(JSON.stringify({ success: false, error: "账号不存在" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (errorCode === "WRONG_PASSWORD") {
      return new Response(JSON.stringify({ success: false, error: "密码错误" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (errorCode === "ACCOUNT_DISABLED") {
      return new Response(JSON.stringify({ success: false, error: "账号已被禁用，请联系管理员" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const emp = result as {
      employee_id: string;
      username: string;
      real_name: string;
      role: string;
      status: string;
      is_super_admin: boolean;
      is_platform_super_admin?: boolean;
      tenant_id?: string | null;
    };

    if (emp.status === "pending") {
      return new Response(JSON.stringify({ success: false, error: "账号正在等待管理员审批，请耐心等待" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (emp.status !== "active") {
      return new Response(JSON.stringify({ success: false, error: "账号已被禁用，请联系管理员" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isPlatformSuperAdmin = emp.is_platform_super_admin ?? (emp.username === "admin" && (emp.is_super_admin ?? false));
    const effectiveTenantId = isPlatformSuperAdmin ? null : (emp.tenant_id ?? null);

    const user = {
      id: emp.employee_id,
      username: emp.username,
      real_name: emp.real_name,
      role: emp.role,
      status: emp.status,
      is_super_admin: emp.is_super_admin ?? false,
      is_platform_super_admin: isPlatformSuperAdmin,
      tenant_id: effectiveTenantId,
    };

    const secret = new TextEncoder().encode(JWT_SECRET);
    const token = await new jose.SignJWT({
      sub: emp.employee_id,
      email: `${emp.username}@system.local`,
      tenant_id: effectiveTenantId ?? undefined,
      role: emp.role,
      username: emp.username,
      real_name: emp.real_name,
      status: emp.status,
      is_super_admin: emp.is_super_admin ?? false,
      is_platform_super_admin: isPlatformSuperAdmin,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("7d")
      .sign(secret);

    return new Response(
      JSON.stringify({ success: true, token, user }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("[employee-login]", e);
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : "登录失败" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
