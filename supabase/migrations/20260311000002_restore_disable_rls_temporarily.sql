-- 临时禁用 RLS 以便数据恢复（恢复完成后需重新启用）
-- 仅对需要恢复的表执行
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['orders','members','employees','employee_permissions','ledger_transactions','member_activity','points_ledger','points_accounts','activity_gifts','shared_data_store','balance_change_logs','operation_logs','audit_records','employee_login_logs','permission_change_logs','employee_name_history','role_permissions','permission_versions','profiles','invitation_codes','vendors','cards','card_types','payment_providers','currencies','customer_sources','activity_types','activity_reward_tiers','referral_relations','shift_handovers','shift_receivers','knowledge_articles','knowledge_categories','knowledge_read_status','data_settings','navigation_config','report_titles','exchange_rate_state','user_data_store','api_keys','webhooks','webhook_delivery_logs'];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE IF EXISTS public.%I DISABLE ROW LEVEL SECURITY', t);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;
