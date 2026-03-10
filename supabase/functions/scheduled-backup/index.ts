import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BACKUP_TABLES = [
  // Tier 1 - Core Business Data
  "orders", "members", "ledger_transactions", "member_activity",
  "points_ledger", "points_accounts", "activity_gifts",
  "shared_data_store", "balance_change_logs",
  // Tier 2 - Audit & Operations
  "operation_logs", "audit_records", "employee_login_logs",
  "permission_change_logs", "employee_name_history",
  // Tier 3 - Employee & Access Control
  "employees", "employee_permissions", "role_permissions",
  "permission_versions", "profiles", "invitation_codes",
  // Tier 4 - Business Configuration
  "vendors", "cards", "card_types", "payment_providers",
  "currencies", "customer_sources", "activity_types",
  "activity_reward_tiers", "referral_relations",
  // Tier 5 - Operations & Knowledge
  "shift_handovers", "shift_receivers",
  "knowledge_articles", "knowledge_categories", "knowledge_read_status",
  // Tier 6 - System Config
  "data_settings", "navigation_config", "report_titles",
  "exchange_rate_state", "user_data_store",
  // Tier 7 - API & Webhooks
  "api_keys", "webhooks", "webhook_delivery_logs",
];

const MAX_BACKUPS = 30;
const MAX_AGE_DAYS = 7;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Determine trigger type from request body
    let triggerType = "auto";
    let createdBy: string | null = null;
    let createdByName = "系统自动";

    try {
      const body = await req.json();
      if (body?.trigger_type === "manual") {
        triggerType = "manual";
        createdBy = body.created_by || null;
        createdByName = body.created_by_name || "管理员";
      }
    } catch {
      // No body = auto trigger from cron
    }

    const now = new Date();
    const backupName = `${triggerType}_${now.toISOString().slice(0, 16).replace("T", "_").replace(":", "-")}`;

    // Create backup record
    const { data: backupRecord, error: insertError } = await supabase
      .from("data_backups")
      .insert({
        backup_name: backupName,
        trigger_type: triggerType,
        status: "in_progress",
        tables_backed_up: BACKUP_TABLES,
        created_by: createdBy,
        created_by_name: createdByName,
      })
      .select()
      .single();

    if (insertError) throw new Error(`Failed to create backup record: ${insertError.message}`);

    const backupId = backupRecord.id;
    const recordCounts: Record<string, number> = {};
    let totalSizeBytes = 0;

    try {
      // Backup each table
      for (const table of BACKUP_TABLES) {
        let allRows: any[] = [];
        let from = 0;
        const batchSize = 1000;

        // Paginate to get all rows
        while (true) {
          const { data, error } = await supabase
            .from(table)
            .select("*")
            .range(from, from + batchSize - 1);

          if (error) throw new Error(`Failed to read ${table}: ${error.message}`);
          if (!data || data.length === 0) break;

          allRows = allRows.concat(data);
          if (data.length < batchSize) break;
          from += batchSize;
        }

        recordCounts[table] = allRows.length;

        // Upload to storage
        const jsonContent = JSON.stringify(allRows);
        const filePath = `${backupId}/${table}.json`;
        const blob = new Blob([jsonContent], { type: "application/json" });

        const { error: uploadError } = await supabase.storage
          .from("data-backups")
          .upload(filePath, blob, {
            contentType: "application/json",
            upsert: true,
          });

        if (uploadError) throw new Error(`Failed to upload ${table}: ${uploadError.message}`);

        totalSizeBytes += new TextEncoder().encode(jsonContent).length;
      }

      // Update backup record as success
      await supabase
        .from("data_backups")
        .update({
          status: "success",
          record_counts: recordCounts,
          total_size_bytes: totalSizeBytes,
          storage_path: backupId,
          completed_at: new Date().toISOString(),
        })
        .eq("id", backupId);

    } catch (err: any) {
      // Mark as failed
      await supabase
        .from("data_backups")
        .update({
          status: "failed",
          error_message: err.message,
          record_counts: recordCounts,
          completed_at: new Date().toISOString(),
        })
        .eq("id", backupId);

      throw err;
    }

    // Cleanup old backups (keep max 30, delete older than 7 days)
    try {
      const { data: allBackups } = await supabase
        .from("data_backups")
        .select("id, created_at, storage_path")
        .order("created_at", { ascending: false });

      if (allBackups && allBackups.length > MAX_BACKUPS) {
        const toDelete = allBackups.slice(MAX_BACKUPS);
        for (const old of toDelete) {
          if (old.storage_path) {
            // List and delete storage files
            const { data: files } = await supabase.storage
              .from("data-backups")
              .list(old.storage_path);
            if (files && files.length > 0) {
              await supabase.storage
                .from("data-backups")
                .remove(files.map((f: any) => `${old.storage_path}/${f.name}`));
            }
          }
          await supabase.from("data_backups").delete().eq("id", old.id);
        }
      }

      // Delete backups older than MAX_AGE_DAYS
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);
      const { data: oldBackups } = await supabase
        .from("data_backups")
        .select("id, storage_path")
        .lt("created_at", cutoff.toISOString());

      if (oldBackups) {
        for (const old of oldBackups) {
          if (old.storage_path) {
            const { data: files } = await supabase.storage
              .from("data-backups")
              .list(old.storage_path);
            if (files && files.length > 0) {
              await supabase.storage
                .from("data-backups")
                .remove(files.map((f: any) => `${old.storage_path}/${f.name}`));
            }
          }
          await supabase.from("data_backups").delete().eq("id", old.id);
        }
      }
    } catch {
      // Cleanup errors are non-fatal
    }

    return new Response(
      JSON.stringify({
        success: true,
        backup_id: backupId,
        backup_name: backupName,
        record_counts: recordCounts,
        total_size_bytes: totalSizeBytes,
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

