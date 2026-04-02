import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Body = {
  username?: string;
  password?: string;
};

serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, message: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return new Response(JSON.stringify({ success: false, message: 'Server not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const body = (await req.json().catch(() => ({}))) as Body;
    const username = (body.username || '').trim();
    const password = body.password || '';

    if (!username || !password) {
      return new Response(JSON.stringify({ success: false, message: 'Missing username or password' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1) 必须先通过员工表密码校验，才允许同步认证密码
    const { data: verifyData, error: verifyError } = await supabaseAdmin.rpc(
      'verify_employee_login_detailed',
      {
        p_username: username,
        p_password: password,
      }
    );

    if (verifyError) {
      return new Response(JSON.stringify({ success: false, message: 'Verify failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const v = Array.isArray(verifyData) && verifyData.length > 0 ? (verifyData[0] as any) : null;
    if (!v || v.error_code) {
      return new Response(JSON.stringify({ success: false, message: v?.error_code || 'INVALID_CREDENTIALS' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2) 同步/创建认证系统账号
    const email = `${username}@system.local`;

    // auth-js@2.89.0 的 Admin API 未提供 getUserByEmail，这里用 listUsers 做一次轻量查找
    const emailLower = email.toLowerCase();
    const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listError) {
      return new Response(JSON.stringify({ success: false, message: 'Auth lookup failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const existingUser =
      listData?.users?.find((u: any) => (u?.email || '').toLowerCase() === emailLower) || null;

    if (!existingUser) {
      const { error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          username: v.username,
          real_name: v.real_name,
          role: v.role,
        },
      });

      if (createError) {
        return new Response(JSON.stringify({ success: false, message: 'Auth create failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true, message: 'Auth user created' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
      password,
      user_metadata: {
        username: v.username,
        real_name: v.real_name,
        role: v.role,
      },
    });

    if (updateError) {
      return new Response(JSON.stringify({ success: false, message: 'Auth update failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, message: 'Auth password synced' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: e instanceof Error ? e.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
