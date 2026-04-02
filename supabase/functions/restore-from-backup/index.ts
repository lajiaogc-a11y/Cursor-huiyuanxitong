/**
 * 从备份恢复数据（订单、会员、员工等）
 * 使用 service_role 读取 storage 并 upsert 到数据库
 *
 * 调用: POST body: { backup_id: "xxx" }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BACKUP_TABLES = [
  "orders", "members", "ledger_transactions", "member_activity",
  "points_ledger", "points_accounts", "activity_gifts",
  "shared_data_store", "balance_change_logs",
  "operation_logs", "audit_records", "employee_login_logs",
  "permission_change_logs", "employee_name_history",
  "employees", "employee_permissions", "role_permissions",
  "permission_versions", "profiles", "invitation_codes",
  "vendors", "cards", "card_types", "payment_providers",
  "currencies", "customer_sources", "activity_types",
  "activity_reward_tiers", "referral_relations",
  "shift_handovers", "shift_receivers",
  "knowledge_articles", "knowledge_categories", "knowledge_read_status",
  "data_settings", "report_titles",
  "exchange_rate_state", "user_data_store",
  "api_keys", "webhooks", "webhook_delivery_logs",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { backup_id } = await req.json().catch(() => ({}));
    if (!backup_id) {
      return new Response(
        JSON.stringify({ success: false, error: "缺少 backup_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const restored: Record<string, number> = {};
    const errors: string[] = [];

    for (const table of BACKUP_TABLES) {
      try {
        const { data: file, error: dlError } = await supabase.storage
          .from("data-backups")
          .download(`${backup_id}/${table}.json`);

        if (dlError || !file) {
          restored[table] = 0;
          continue;
        }

        const text = await file.text();
        const rows = JSON.parse(text);
        if (!Array.isArray(rows) || rows.length === 0) {
          restored[table] = 0;
          continue;
        }

        for (let i = 0; i < rows.length; i += 200) {
          const batch = rows.slice(i, i + 200);
          const { error: upsertError } = await supabase
            .from(table)
            .upsert(batch, { onConflict: "id" });

          if (upsertError) {
            errors.push(`${table}: ${upsertError.message}`);
            break;
          }
        }
        restored[table] = rows.length;
      } catch (err: any) {
        errors.push(`${table}: ${err.message}`);
      }
    }

    const total = Object.values(restored).reduce((a, b) => a + b, 0);
    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        restored,
        total,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
