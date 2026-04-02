import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Body = {
  member_id?: string;
  new_password?: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "METHOD_NOT_ALLOWED" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: "SERVER_NOT_CONFIGURED" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 验证调用者已登录（员工）
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "UNAUTHORIZED" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const memberId = (body.member_id || "").trim();
    const newPassword = (body.new_password || "").trim();

    if (!memberId || !newPassword) {
      return new Response(
        JSON.stringify({ success: false, error: "MISSING_PARAMS" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (newPassword.length < 6) {
      return new Response(
        JSON.stringify({ success: false, error: "PASSWORD_TOO_SHORT" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { hashSync } = await import("https://deno.land/x/bcrypt@v0.4.1/mod.ts");
    const passwordHash = hashSync(newPassword);

    const { data: member, error: updateError } = await supabaseAdmin
      .from("members")
      .update({
        password_hash: passwordHash,
        initial_password_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", memberId)
      .select("id")
      .single();

    if (updateError) {
      if (updateError.code === "PGRST116" || updateError.message?.includes("column")) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "COLUMN_NOT_FOUND",
            message: "members 表缺少 password_hash 列，请先在 Supabase SQL Editor 执行：ALTER TABLE members ADD COLUMN IF NOT EXISTS password_hash text; ALTER TABLE members ADD COLUMN IF NOT EXISTS initial_password_sent_at timestamptz;",
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: false, error: "UPDATE_FAILED", message: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!member) {
      return new Response(
        JSON.stringify({ success: false, error: "MEMBER_NOT_FOUND" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: "UNKNOWN", message: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
