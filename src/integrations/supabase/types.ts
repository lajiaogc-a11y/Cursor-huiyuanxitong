export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activity_gifts: {
        Row: {
          amount: number
          created_at: string
          creator_id: string | null
          currency: string
          fee: number | null
          gift_type: string | null
          gift_value: number | null
          id: string
          member_id: string | null
          payment_agent: string
          phone_number: string
          rate: number
          remark: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          creator_id?: string | null
          currency: string
          fee?: number | null
          gift_type?: string | null
          gift_value?: number | null
          id?: string
          member_id?: string | null
          payment_agent: string
          phone_number: string
          rate: number
          remark?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          creator_id?: string | null
          currency?: string
          fee?: number | null
          gift_type?: string | null
          gift_value?: number | null
          id?: string
          member_id?: string | null
          payment_agent?: string
          phone_number?: string
          rate?: number
          remark?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_gifts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_gifts_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_reward_tiers: {
        Row: {
          created_at: string
          id: string
          max_points: number | null
          min_points: number
          reward_amount_ghs: number | null
          reward_amount_ngn: number | null
          reward_amount_usdt: number | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_points?: number | null
          min_points: number
          reward_amount_ghs?: number | null
          reward_amount_ngn?: number | null
          reward_amount_usdt?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          max_points?: number | null
          min_points?: number
          reward_amount_ghs?: number | null
          reward_amount_ngn?: number | null
          reward_amount_usdt?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      activity_types: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          label: string
          sort_order: number | null
          updated_at: string | null
          value: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          sort_order?: number | null
          updated_at?: string | null
          value: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          sort_order?: number | null
          updated_at?: string | null
          value?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          ip_whitelist: string[] | null
          key_hash: string
          key_prefix: string
          last_used_at: string | null
          name: string
          permissions: Json
          rate_limit: number
          remark: string | null
          status: string
          total_requests: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          ip_whitelist?: string[] | null
          key_hash: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          permissions?: Json
          rate_limit?: number
          remark?: string | null
          status?: string
          total_requests?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          ip_whitelist?: string[] | null
          key_hash?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          permissions?: Json
          rate_limit?: number
          remark?: string | null
          status?: string
          total_requests?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      api_rate_limits: {
        Row: {
          api_key_id: string
          id: string
          request_count: number
          window_start: string
        }
        Insert: {
          api_key_id: string
          id?: string
          request_count?: number
          window_start: string
        }
        Update: {
          api_key_id?: string
          id?: string
          request_count?: number
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_rate_limits_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      api_request_logs: {
        Row: {
          api_key_id: string | null
          created_at: string
          endpoint: string
          error_message: string | null
          id: string
          ip_address: string | null
          key_prefix: string | null
          method: string
          request_params: Json | null
          response_status: number
          response_time_ms: number | null
          user_agent: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          endpoint: string
          error_message?: string | null
          id?: string
          ip_address?: string | null
          key_prefix?: string | null
          method?: string
          request_params?: Json | null
          response_status: number
          response_time_ms?: number | null
          user_agent?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          endpoint?: string
          error_message?: string | null
          id?: string
          ip_address?: string | null
          key_prefix?: string | null
          method?: string
          request_params?: Json | null
          response_status?: number
          response_time_ms?: number | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_request_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      archive_runs: {
        Row: {
          duration_ms: number | null
          error_message: string | null
          id: string
          records_archived: Json
          records_deleted: Json
          run_at: string
          status: string
          tables_processed: string[]
          triggered_by: string
        }
        Insert: {
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          records_archived?: Json
          records_deleted?: Json
          run_at?: string
          status?: string
          tables_processed?: string[]
          triggered_by?: string
        }
        Update: {
          duration_ms?: number | null
          error_message?: string | null
          id?: string
          records_archived?: Json
          records_deleted?: Json
          run_at?: string
          status?: string
          tables_processed?: string[]
          triggered_by?: string
        }
        Relationships: []
      }
      archived_operation_logs: {
        Row: {
          archived_at: string
          id: string
          module: string
          operation_type: string
          operator_account: string
          operator_role: string
          original_data: Json
          original_id: string
          timestamp: string | null
        }
        Insert: {
          archived_at?: string
          id?: string
          module: string
          operation_type: string
          operator_account: string
          operator_role: string
          original_data: Json
          original_id: string
          timestamp?: string | null
        }
        Update: {
          archived_at?: string
          id?: string
          module?: string
          operation_type?: string
          operator_account?: string
          operator_role?: string
          original_data?: Json
          original_id?: string
          timestamp?: string | null
        }
        Relationships: []
      }
      archived_orders: {
        Row: {
          actual_payment: number | null
          amount: number
          archived_at: string
          completed_at: string | null
          created_at: string
          currency: string | null
          exchange_rate: number | null
          fee: number | null
          id: string
          order_number: string
          order_type: string
          original_data: Json
          original_id: string
          phone_number: string | null
          profit_ngn: number | null
          profit_usdt: number | null
          status: string
        }
        Insert: {
          actual_payment?: number | null
          amount?: number
          archived_at?: string
          completed_at?: string | null
          created_at: string
          currency?: string | null
          exchange_rate?: number | null
          fee?: number | null
          id?: string
          order_number: string
          order_type: string
          original_data: Json
          original_id: string
          phone_number?: string | null
          profit_ngn?: number | null
          profit_usdt?: number | null
          status: string
        }
        Update: {
          actual_payment?: number | null
          amount?: number
          archived_at?: string
          completed_at?: string | null
          created_at?: string
          currency?: string | null
          exchange_rate?: number | null
          fee?: number | null
          id?: string
          order_number?: string
          order_type?: string
          original_data?: Json
          original_id?: string
          phone_number?: string | null
          profit_ngn?: number | null
          profit_usdt?: number | null
          status?: string
        }
        Relationships: []
      }
      archived_points_ledger: {
        Row: {
          archived_at: string
          created_at: string
          id: string
          member_code: string | null
          original_data: Json
          original_id: string
          phone_number: string | null
          points_earned: number
          transaction_type: string
        }
        Insert: {
          archived_at?: string
          created_at: string
          id?: string
          member_code?: string | null
          original_data: Json
          original_id: string
          phone_number?: string | null
          points_earned: number
          transaction_type: string
        }
        Update: {
          archived_at?: string
          created_at?: string
          id?: string
          member_code?: string | null
          original_data?: Json
          original_id?: string
          phone_number?: string | null
          points_earned?: number
          transaction_type?: string
        }
        Relationships: []
      }
      audit_records: {
        Row: {
          action_type: string
          created_at: string
          id: string
          new_data: Json
          old_data: Json | null
          review_comment: string | null
          review_time: string | null
          reviewer_id: string | null
          status: string
          submitter_id: string | null
          target_id: string
          target_table: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          new_data: Json
          old_data?: Json | null
          review_comment?: string | null
          review_time?: string | null
          reviewer_id?: string | null
          status?: string
          submitter_id?: string | null
          target_id: string
          target_table: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          new_data?: Json
          old_data?: Json | null
          review_comment?: string | null
          review_time?: string | null
          reviewer_id?: string | null
          status?: string
          submitter_id?: string | null
          target_id?: string
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_records_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_records_submitter_id_fkey"
            columns: ["submitter_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      balance_change_logs: {
        Row: {
          balance_after: number
          balance_before: number
          change_amount: number
          change_type: string
          created_at: string
          id: string
          merchant_name: string
          merchant_type: string
          operator_id: string | null
          operator_name: string | null
          related_id: string | null
          remark: string | null
        }
        Insert: {
          balance_after?: number
          balance_before?: number
          change_amount: number
          change_type: string
          created_at?: string
          id?: string
          merchant_name: string
          merchant_type: string
          operator_id?: string | null
          operator_name?: string | null
          related_id?: string | null
          remark?: string | null
        }
        Update: {
          balance_after?: number
          balance_before?: number
          change_amount?: number
          change_type?: string
          created_at?: string
          id?: string
          merchant_name?: string
          merchant_type?: string
          operator_id?: string | null
          operator_name?: string | null
          related_id?: string | null
          remark?: string | null
        }
        Relationships: []
      }
      card_types: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      cards: {
        Row: {
          card_vendors: string[] | null
          created_at: string
          id: string
          name: string
          remark: string | null
          sort_order: number | null
          status: string
          type: string | null
          updated_at: string
        }
        Insert: {
          card_vendors?: string[] | null
          created_at?: string
          id?: string
          name: string
          remark?: string | null
          sort_order?: number | null
          status?: string
          type?: string | null
          updated_at?: string
        }
        Update: {
          card_vendors?: string[] | null
          created_at?: string
          id?: string
          name?: string
          remark?: string | null
          sort_order?: number | null
          status?: string
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      currencies: {
        Row: {
          badge_color: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          name_en: string
          name_zh: string
          sort_order: number
          symbol: string | null
          updated_at: string
        }
        Insert: {
          badge_color?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_en: string
          name_zh: string
          sort_order?: number
          symbol?: string | null
          updated_at?: string
        }
        Update: {
          badge_color?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name_en?: string
          name_zh?: string
          sort_order?: number
          symbol?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      customer_sources: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      data_backups: {
        Row: {
          backup_name: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          created_by_name: string
          error_message: string | null
          id: string
          record_counts: Json
          status: string
          storage_path: string | null
          tables_backed_up: string[]
          total_size_bytes: number
          trigger_type: string
        }
        Insert: {
          backup_name: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          error_message?: string | null
          id?: string
          record_counts?: Json
          status?: string
          storage_path?: string | null
          tables_backed_up?: string[]
          total_size_bytes?: number
          trigger_type?: string
        }
        Update: {
          backup_name?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          error_message?: string | null
          id?: string
          record_counts?: Json
          status?: string
          storage_path?: string | null
          tables_backed_up?: string[]
          total_size_bytes?: number
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "data_backups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      data_settings: {
        Row: {
          id: string
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          id?: string
          setting_key: string
          setting_value: Json
          updated_at?: string
        }
        Update: {
          id?: string
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      employee_login_logs: {
        Row: {
          created_at: string
          employee_id: string
          failure_reason: string | null
          id: string
          ip_address: string | null
          login_method: string | null
          login_time: string
          success: boolean | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          employee_id: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          login_method?: string | null
          login_time?: string
          success?: boolean | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string
          failure_reason?: string | null
          id?: string
          ip_address?: string | null
          login_method?: string | null
          login_time?: string
          success?: boolean | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_login_logs_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_name_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          employee_id: string
          id: string
          new_name: string
          old_name: string
          reason: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          employee_id: string
          id?: string
          new_name: string
          old_name: string
          reason?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          employee_id?: string
          id?: string
          new_name?: string
          old_name?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_name_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employee_name_history_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_permissions: {
        Row: {
          can_edit_directly: boolean
          created_at: string
          employee_id: string | null
          id: string
          permission_key: string
          requires_approval: boolean
        }
        Insert: {
          can_edit_directly?: boolean
          created_at?: string
          employee_id?: string | null
          id?: string
          permission_key: string
          requires_approval?: boolean
        }
        Update: {
          can_edit_directly?: boolean
          created_at?: string
          employee_id?: string | null
          id?: string
          permission_key?: string
          requires_approval?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "employee_permissions_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          created_at: string
          id: string
          is_super_admin: boolean | null
          password_hash: string
          real_name: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          updated_at: string
          username: string
          visible: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          is_super_admin?: boolean | null
          password_hash: string
          real_name: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
          username: string
          visible?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          is_super_admin?: boolean | null
          password_hash?: string
          real_name?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: string
          updated_at?: string
          username?: string
          visible?: boolean
        }
        Relationships: []
      }
      error_reports: {
        Row: {
          component_stack: string | null
          created_at: string
          employee_id: string | null
          error_message: string
          error_stack: string | null
          id: string
          url: string | null
          user_agent: string | null
        }
        Insert: {
          component_stack?: string | null
          created_at?: string
          employee_id?: string | null
          error_message: string
          error_stack?: string | null
          id?: string
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          component_stack?: string | null
          created_at?: string
          employee_id?: string | null
          error_message?: string
          error_stack?: string | null
          id?: string
          url?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      exchange_rate_state: {
        Row: {
          form_data: Json
          id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          form_data?: Json
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          form_data?: Json
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      invitation_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number
          used_count: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number
          used_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "invitation_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_articles: {
        Row: {
          category_id: string
          content: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          image_url: string | null
          is_published: boolean
          sort_order: number
          title_en: string | null
          title_zh: string
          updated_at: string
          visibility: string
        }
        Insert: {
          category_id: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_published?: boolean
          sort_order?: number
          title_en?: string | null
          title_zh: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          category_id?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_published?: boolean
          sort_order?: number
          title_en?: string | null
          title_zh?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "knowledge_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_articles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_categories: {
        Row: {
          content_type: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
          visibility: string
        }
        Insert: {
          content_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
          visibility?: string
        }
        Update: {
          content_type?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_categories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_read_status: {
        Row: {
          article_id: string
          employee_id: string
          id: string
          read_at: string
        }
        Insert: {
          article_id: string
          employee_id: string
          id?: string
          read_at?: string
        }
        Update: {
          article_id?: string
          employee_id?: string
          id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_read_status_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_read_status_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_transactions: {
        Row: {
          account_id: string
          account_type: string
          after_balance: number
          amount: number
          before_balance: number
          created_at: string
          id: string
          is_active: boolean
          note: string | null
          operator_id: string | null
          operator_name: string | null
          reversal_of: string | null
          source_id: string | null
          source_type: string
        }
        Insert: {
          account_id: string
          account_type: string
          after_balance?: number
          amount?: number
          before_balance?: number
          created_at?: string
          id?: string
          is_active?: boolean
          note?: string | null
          operator_id?: string | null
          operator_name?: string | null
          reversal_of?: string | null
          source_id?: string | null
          source_type: string
        }
        Update: {
          account_id?: string
          account_type?: string
          after_balance?: number
          amount?: number
          before_balance?: number
          created_at?: string
          id?: string
          is_active?: boolean
          note?: string | null
          operator_id?: string | null
          operator_name?: string | null
          reversal_of?: string | null
          source_id?: string | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "ledger_transactions_reversal_of_fkey"
            columns: ["reversal_of"]
            isOneToOne: false
            referencedRelation: "ledger_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      member_activity: {
        Row: {
          accumulated_points: number
          accumulated_profit: number | null
          accumulated_profit_usdt: number | null
          created_at: string
          id: string
          last_reset_time: string | null
          member_id: string | null
          order_count: number
          phone_number: string | null
          referral_count: number
          referral_points: number
          remaining_points: number
          total_accumulated_ghs: number | null
          total_accumulated_ngn: number | null
          total_accumulated_usdt: number | null
          total_gift_ghs: number | null
          total_gift_ngn: number | null
          total_gift_usdt: number | null
          updated_at: string
        }
        Insert: {
          accumulated_points?: number
          accumulated_profit?: number | null
          accumulated_profit_usdt?: number | null
          created_at?: string
          id?: string
          last_reset_time?: string | null
          member_id?: string | null
          order_count?: number
          phone_number?: string | null
          referral_count?: number
          referral_points?: number
          remaining_points?: number
          total_accumulated_ghs?: number | null
          total_accumulated_ngn?: number | null
          total_accumulated_usdt?: number | null
          total_gift_ghs?: number | null
          total_gift_ngn?: number | null
          total_gift_usdt?: number | null
          updated_at?: string
        }
        Update: {
          accumulated_points?: number
          accumulated_profit?: number | null
          accumulated_profit_usdt?: number | null
          created_at?: string
          id?: string
          last_reset_time?: string | null
          member_id?: string | null
          order_count?: number
          phone_number?: string | null
          referral_count?: number
          referral_points?: number
          remaining_points?: number
          total_accumulated_ghs?: number | null
          total_accumulated_ngn?: number | null
          total_accumulated_usdt?: number | null
          total_gift_ghs?: number | null
          total_gift_ngn?: number | null
          total_gift_usdt?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "member_activity_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: true
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          bank_card: string | null
          common_cards: string[] | null
          created_at: string
          creator_id: string | null
          currency_preferences: string[] | null
          customer_feature: string | null
          id: string
          member_code: string
          member_level: string | null
          phone_number: string
          recorder_id: string | null
          remark: string | null
          source_id: string | null
          updated_at: string
        }
        Insert: {
          bank_card?: string | null
          common_cards?: string[] | null
          created_at?: string
          creator_id?: string | null
          currency_preferences?: string[] | null
          customer_feature?: string | null
          id?: string
          member_code: string
          member_level?: string | null
          phone_number: string
          recorder_id?: string | null
          remark?: string | null
          source_id?: string | null
          updated_at?: string
        }
        Update: {
          bank_card?: string | null
          common_cards?: string[] | null
          created_at?: string
          creator_id?: string | null
          currency_preferences?: string[] | null
          customer_feature?: string | null
          id?: string
          member_code?: string
          member_level?: string | null
          phone_number?: string
          recorder_id?: string | null
          remark?: string | null
          source_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "members_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_recorder_id_fkey"
            columns: ["recorder_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "members_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "customer_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      navigation_config: {
        Row: {
          display_text_en: string
          display_text_zh: string
          id: string
          is_visible: boolean
          nav_key: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          display_text_en: string
          display_text_zh: string
          id?: string
          is_visible?: boolean
          nav_key: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          display_text_en?: string
          display_text_zh?: string
          id?: string
          is_visible?: boolean
          nav_key?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          category: string
          created_at: string
          id: string
          is_read: boolean
          link: string | null
          message: string
          metadata: Json | null
          recipient_id: string
          title: string
          type: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message: string
          metadata?: Json | null
          recipient_id: string
          title: string
          type?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          is_read?: boolean
          link?: string | null
          message?: string
          metadata?: Json | null
          recipient_id?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      operation_logs: {
        Row: {
          after_data: Json | null
          before_data: Json | null
          id: string
          ip_address: string | null
          is_restored: boolean | null
          module: string
          object_description: string | null
          object_id: string | null
          operation_type: string
          operator_account: string
          operator_id: string | null
          operator_role: string
          restored_at: string | null
          restored_by: string | null
          timestamp: string | null
        }
        Insert: {
          after_data?: Json | null
          before_data?: Json | null
          id?: string
          ip_address?: string | null
          is_restored?: boolean | null
          module: string
          object_description?: string | null
          object_id?: string | null
          operation_type: string
          operator_account: string
          operator_id?: string | null
          operator_role: string
          restored_at?: string | null
          restored_by?: string | null
          timestamp?: string | null
        }
        Update: {
          after_data?: Json | null
          before_data?: Json | null
          id?: string
          ip_address?: string | null
          is_restored?: boolean | null
          module?: string
          object_description?: string | null
          object_id?: string | null
          operation_type?: string
          operator_account?: string
          operator_id?: string | null
          operator_role?: string
          restored_at?: string | null
          restored_by?: string | null
          timestamp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "operation_logs_operator_id_fkey"
            columns: ["operator_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "operation_logs_restored_by_fkey"
            columns: ["restored_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          actual_payment: number | null
          amount: number
          card_merchant_id: string | null
          card_value: number | null
          completed_at: string | null
          created_at: string
          creator_id: string | null
          currency: string | null
          data_version: number | null
          deleted_at: string | null
          exchange_rate: number | null
          fee: number | null
          foreign_rate: number | null
          id: string
          is_deleted: boolean
          member_code_snapshot: string | null
          member_id: string | null
          order_number: string
          order_points: number | null
          order_type: string
          payment_value: number | null
          phone_number: string | null
          points_status: string | null
          profit_ngn: number | null
          profit_rate: number | null
          profit_usdt: number | null
          remark: string | null
          sales_user_id: string | null
          status: string
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          actual_payment?: number | null
          amount?: number
          card_merchant_id?: string | null
          card_value?: number | null
          completed_at?: string | null
          created_at?: string
          creator_id?: string | null
          currency?: string | null
          data_version?: number | null
          deleted_at?: string | null
          exchange_rate?: number | null
          fee?: number | null
          foreign_rate?: number | null
          id?: string
          is_deleted?: boolean
          member_code_snapshot?: string | null
          member_id?: string | null
          order_number: string
          order_points?: number | null
          order_type: string
          payment_value?: number | null
          phone_number?: string | null
          points_status?: string | null
          profit_ngn?: number | null
          profit_rate?: number | null
          profit_usdt?: number | null
          remark?: string | null
          sales_user_id?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          actual_payment?: number | null
          amount?: number
          card_merchant_id?: string | null
          card_value?: number | null
          completed_at?: string | null
          created_at?: string
          creator_id?: string | null
          currency?: string | null
          data_version?: number | null
          deleted_at?: string | null
          exchange_rate?: number | null
          fee?: number | null
          foreign_rate?: number | null
          id?: string
          is_deleted?: boolean
          member_code_snapshot?: string | null
          member_id?: string | null
          order_number?: string
          order_points?: number | null
          order_type?: string
          payment_value?: number | null
          phone_number?: string | null
          points_status?: string | null
          profit_ngn?: number | null
          profit_rate?: number | null
          profit_usdt?: number | null
          remark?: string | null
          sales_user_id?: string | null
          status?: string
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_sales_user_id_fkey"
            columns: ["sales_user_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_providers: {
        Row: {
          created_at: string
          id: string
          name: string
          remark: string | null
          sort_order: number | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          remark?: string | null
          sort_order?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          remark?: string | null
          sort_order?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      permission_change_logs: {
        Row: {
          action_type: string
          after_data: Json | null
          before_data: Json | null
          changed_at: string
          changed_by: string | null
          changed_by_name: string
          changed_by_role: string
          changes_summary: Json
          id: string
          ip_address: string | null
          is_rollback: boolean | null
          rollback_to_version_id: string | null
          target_role: string
          template_name: string | null
        }
        Insert: {
          action_type: string
          after_data?: Json | null
          before_data?: Json | null
          changed_at?: string
          changed_by?: string | null
          changed_by_name: string
          changed_by_role: string
          changes_summary?: Json
          id?: string
          ip_address?: string | null
          is_rollback?: boolean | null
          rollback_to_version_id?: string | null
          target_role: string
          template_name?: string | null
        }
        Update: {
          action_type?: string
          after_data?: Json | null
          before_data?: Json | null
          changed_at?: string
          changed_by?: string | null
          changed_by_name?: string
          changed_by_role?: string
          changes_summary?: Json
          id?: string
          ip_address?: string | null
          is_rollback?: boolean | null
          rollback_to_version_id?: string | null
          target_role?: string
          template_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "permission_change_logs_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "permission_change_logs_rollback_to_version_id_fkey"
            columns: ["rollback_to_version_id"]
            isOneToOne: false
            referencedRelation: "permission_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      permission_versions: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string
          id: string
          is_auto_backup: boolean | null
          permissions_snapshot: Json
          target_role: string
          version_description: string | null
          version_name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name: string
          id?: string
          is_auto_backup?: boolean | null
          permissions_snapshot: Json
          target_role: string
          version_description?: string | null
          version_name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string
          id?: string
          is_auto_backup?: boolean | null
          permissions_snapshot?: Json
          target_role?: string
          version_description?: string | null
          version_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "permission_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      points_accounts: {
        Row: {
          current_cycle_id: string | null
          current_points: number | null
          id: string
          last_reset_time: string | null
          last_updated: string
          member_code: string
          phone: string
          points_accrual_start_time: string
        }
        Insert: {
          current_cycle_id?: string | null
          current_points?: number | null
          id?: string
          last_reset_time?: string | null
          last_updated?: string
          member_code: string
          phone: string
          points_accrual_start_time?: string
        }
        Update: {
          current_cycle_id?: string | null
          current_points?: number | null
          id?: string
          last_reset_time?: string | null
          last_updated?: string
          member_code?: string
          phone?: string
          points_accrual_start_time?: string
        }
        Relationships: []
      }
      points_ledger: {
        Row: {
          actual_payment: number | null
          created_at: string
          creator_id: string | null
          creator_name: string | null
          currency: string | null
          exchange_rate: number | null
          id: string
          member_code: string | null
          member_id: string | null
          order_id: string | null
          phone_number: string | null
          points_earned: number
          points_multiplier: number | null
          status: string
          transaction_type: string
          usd_amount: number | null
        }
        Insert: {
          actual_payment?: number | null
          created_at?: string
          creator_id?: string | null
          creator_name?: string | null
          currency?: string | null
          exchange_rate?: number | null
          id?: string
          member_code?: string | null
          member_id?: string | null
          order_id?: string | null
          phone_number?: string | null
          points_earned?: number
          points_multiplier?: number | null
          status?: string
          transaction_type: string
          usd_amount?: number | null
        }
        Update: {
          actual_payment?: number | null
          created_at?: string
          creator_id?: string | null
          creator_name?: string | null
          currency?: string | null
          exchange_rate?: number | null
          id?: string
          member_code?: string | null
          member_id?: string | null
          order_id?: string | null
          phone_number?: string | null
          points_earned?: number
          points_multiplier?: number | null
          status?: string
          transaction_type?: string
          usd_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "points_ledger_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_ledger_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      points_summary: {
        Row: {
          id: string
          last_updated: string
          net_points: number
          total_issued_points: number
          total_reversed_points: number
          transaction_count: number
        }
        Insert: {
          id?: string
          last_updated?: string
          net_points?: number
          total_issued_points?: number
          total_reversed_points?: number
          transaction_count?: number
        }
        Update: {
          id?: string
          last_updated?: string
          net_points?: number
          total_issued_points?: number
          total_reversed_points?: number
          transaction_count?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          employee_id: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          employee_id?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          employee_id?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_relations: {
        Row: {
          created_at: string
          id: string
          referee_member_code: string
          referee_phone: string
          referrer_member_code: string
          referrer_phone: string
          source: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          referee_member_code: string
          referee_phone: string
          referrer_member_code: string
          referrer_phone: string
          source?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          referee_member_code?: string
          referee_phone?: string
          referrer_member_code?: string
          referrer_phone?: string
          source?: string | null
        }
        Relationships: []
      }
      report_titles: {
        Row: {
          id: string
          report_key: string
          title_en: string
          title_zh: string
          updated_at: string
        }
        Insert: {
          id?: string
          report_key: string
          title_en: string
          title_zh: string
          updated_at?: string
        }
        Update: {
          id?: string
          report_key?: string
          title_en?: string
          title_zh?: string
          updated_at?: string
        }
        Relationships: []
      }
      risk_events: {
        Row: {
          created_at: string
          details: Json
          employee_id: string | null
          event_type: string
          id: string
          resolved: boolean
          resolved_at: string | null
          resolved_by: string | null
          score: number
          severity: string
        }
        Insert: {
          created_at?: string
          details?: Json
          employee_id?: string | null
          event_type: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          score?: number
          severity?: string
        }
        Update: {
          created_at?: string
          details?: Json
          employee_id?: string | null
          event_type?: string
          id?: string
          resolved?: boolean
          resolved_at?: string | null
          resolved_by?: string | null
          score?: number
          severity?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_events_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_events_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_scores: {
        Row: {
          auto_action_taken: string | null
          current_score: number
          employee_id: string | null
          factors: Json
          id: string
          last_calculated_at: string
          risk_level: string
          updated_at: string
        }
        Insert: {
          auto_action_taken?: string | null
          current_score?: number
          employee_id?: string | null
          factors?: Json
          id?: string
          last_calculated_at?: string
          risk_level?: string
          updated_at?: string
        }
        Update: {
          auto_action_taken?: string | null
          current_score?: number
          employee_id?: string | null
          factors?: Json
          id?: string
          last_calculated_at?: string
          risk_level?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "risk_scores_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          can_delete: boolean
          can_edit: boolean
          can_view: boolean
          created_at: string
          field_name: string
          id: string
          module_name: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          field_name: string
          id?: string
          module_name: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          can_delete?: boolean
          can_edit?: boolean
          can_view?: boolean
          created_at?: string
          field_name?: string
          id?: string
          module_name?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      shared_data_store: {
        Row: {
          created_at: string
          data_key: string
          data_value: Json
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_key: string
          data_value?: Json
          id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_key?: string
          data_value?: Json
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      shift_handovers: {
        Row: {
          card_merchant_data: Json
          created_at: string
          handover_employee_id: string | null
          handover_employee_name: string
          handover_time: string
          id: string
          payment_provider_data: Json
          receiver_name: string
          remark: string | null
        }
        Insert: {
          card_merchant_data?: Json
          created_at?: string
          handover_employee_id?: string | null
          handover_employee_name: string
          handover_time?: string
          id?: string
          payment_provider_data?: Json
          receiver_name: string
          remark?: string | null
        }
        Update: {
          card_merchant_data?: Json
          created_at?: string
          handover_employee_id?: string | null
          handover_employee_name?: string
          handover_time?: string
          id?: string
          payment_provider_data?: Json
          receiver_name?: string
          remark?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shift_handovers_handover_employee_id_fkey"
            columns: ["handover_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      shift_receivers: {
        Row: {
          created_at: string
          creator_id: string | null
          id: string
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          creator_id?: string | null
          id?: string
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          creator_id?: string | null
          id?: string
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shift_receivers_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      user_data_store: {
        Row: {
          created_at: string
          data_key: string
          data_value: Json
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_key: string
          data_value?: Json
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_key?: string
          data_value?: Json
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          created_at: string
          id: string
          name: string
          payment_providers: string[] | null
          remark: string | null
          sort_order: number | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          payment_providers?: string[] | null
          remark?: string | null
          sort_order?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          payment_providers?: string[] | null
          remark?: string | null
          sort_order?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      web_vitals: {
        Row: {
          created_at: string
          employee_id: string | null
          id: string
          metric_name: string
          metric_value: number
          navigation_type: string | null
          rating: string | null
          url: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          employee_id?: string | null
          id?: string
          metric_name: string
          metric_value: number
          navigation_type?: string | null
          rating?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          employee_id?: string | null
          id?: string
          metric_name?: string
          metric_value?: number
          navigation_type?: string | null
          rating?: string | null
          url?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      webhook_delivery_logs: {
        Row: {
          attempt_count: number
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          response_body: string | null
          response_status: number | null
          response_time_ms: number | null
          success: boolean
          webhook_id: string | null
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          payload: Json
          response_body?: string | null
          response_status?: number | null
          response_time_ms?: number | null
          success?: boolean
          webhook_id?: string | null
        }
        Update: {
          attempt_count?: number
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          response_time_ms?: number | null
          success?: boolean
          webhook_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webhook_delivery_logs_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_event_queue: {
        Row: {
          created_at: string
          event_type: string
          id: string
          max_retries: number
          next_retry_at: string | null
          payload: Json
          processed_at: string | null
          retry_count: number
          status: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          max_retries?: number
          next_retry_at?: string | null
          payload: Json
          processed_at?: string | null
          retry_count?: number
          status?: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          max_retries?: number
          next_retry_at?: string | null
          payload?: Json
          processed_at?: string | null
          retry_count?: number
          status?: string
        }
        Relationships: []
      }
      webhooks: {
        Row: {
          created_at: string
          created_by: string | null
          events: string[]
          failed_deliveries: number
          headers: Json | null
          id: string
          last_triggered_at: string | null
          name: string
          remark: string | null
          retry_count: number
          secret: string | null
          status: string
          successful_deliveries: number
          timeout_ms: number
          total_deliveries: number
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          events?: string[]
          failed_deliveries?: number
          headers?: Json | null
          id?: string
          last_triggered_at?: string | null
          name: string
          remark?: string | null
          retry_count?: number
          secret?: string | null
          status?: string
          successful_deliveries?: number
          timeout_ms?: number
          total_deliveries?: number
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          events?: string[]
          failed_deliveries?: number
          headers?: Json | null
          id?: string
          last_triggered_at?: string | null
          name?: string
          remark?: string | null
          retry_count?: number
          secret?: string | null
          status?: string
          successful_deliveries?: number
          timeout_ms?: number
          total_deliveries?: number
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhooks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_reset_password: {
        Args: {
          p_admin_id: string
          p_new_password: string
          p_target_employee_id: string
        }
        Returns: {
          message: string
          success: boolean
        }[]
      }
      archive_old_data: { Args: { retention_days?: number }; Returns: Json }
      calculate_member_points: {
        Args: { p_last_reset_time?: string; p_member_code: string }
        Returns: number
      }
      can_modify_name: {
        Args: { _employee_id: string; _modifier_id: string }
        Returns: boolean
      }
      cleanup_expired_rate_limits: { Args: never; Returns: undefined }
      create_ledger_entry: {
        Args: {
          p_account_id: string
          p_account_type: string
          p_amount: number
          p_note?: string
          p_operator_id?: string
          p_operator_name?: string
          p_reversal_of?: string
          p_source_id: string
          p_source_type: string
        }
        Returns: {
          account_id: string
          account_type: string
          after_balance: number
          amount: number
          before_balance: number
          created_at: string
          id: string
          is_active: boolean
          note: string | null
          operator_id: string | null
          operator_name: string | null
          reversal_of: string | null
          source_id: string | null
          source_type: string
        }
        SetofOptions: {
          from: "*"
          to: "ledger_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_activity_gift_and_restore: {
        Args: { p_gift_id: string }
        Returns: Json
      }
      generate_invitation_code: {
        Args: {
          p_creator_id?: string
          p_expires_at?: string
          p_max_uses?: number
        }
        Returns: string
      }
      get_active_employees_safe: {
        Args: never
        Returns: {
          id: string
          real_name: string
        }[]
      }
      get_active_visible_employees_safe: {
        Args: never
        Returns: {
          id: string
          real_name: string
        }[]
      }
      get_api_daily_stats: {
        Args: { p_days?: number }
        Returns: {
          avg_response_time: number
          error_rate: number
          failed_requests: number
          stat_date: string
          successful_requests: number
          total_requests: number
        }[]
      }
      get_api_endpoint_stats: {
        Args: { p_days?: number }
        Returns: {
          avg_response_time: number
          endpoint: string
          failed_requests: number
          successful_requests: number
          total_requests: number
        }[]
      }
      get_order_filter_stats: {
        Args: {
          p_card_type?: string
          p_creator_id?: string
          p_currency?: string
          p_end_date?: string
          p_max_profit?: number
          p_min_profit?: number
          p_payment_provider?: string
          p_search_term?: string
          p_start_date?: string
          p_status?: string
          p_tenant_id?: string
          p_vendor?: string
        }
        Returns: {
          total_card_value: number
          total_profit: number
          trading_users: number
        }[]
      }
      get_dashboard_trend_data: {
        Args: {
          p_end_date: string
          p_sales_person?: string
          p_start_date: string
        }
        Returns: {
          day_date: string
          ghs_profit: number
          ghs_volume: number
          ngn_profit: number
          ngn_volume: number
          order_count: number
          profit: number
          trading_users: number
          usdt_profit: number
          usdt_volume: number
        }[]
      }
      get_employee_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_employee_login: {
        Args: {
          p_employee_id: string
          p_failure_reason?: string
          p_ip_address?: string
          p_success?: boolean
          p_user_agent?: string
        }
        Returns: string
      }
      queue_webhook_event: {
        Args: { p_event_type: string; p_payload: Json }
        Returns: string
      }
      recompute_account_balance: {
        Args: { p_account_id: string; p_account_type: string }
        Returns: {
          active_sum: number
          computed_balance: number
          initial_balance: number
          transaction_count: number
        }[]
      }
      redeem_points_and_record: {
        Args: {
          p_activity_type: string
          p_creator_id: string
          p_creator_name: string
          p_gift_amount: number
          p_gift_currency: string
          p_gift_fee: number
          p_gift_rate: number
          p_gift_value: number
          p_member_code: string
          p_member_id: string
          p_payment_agent: string
          p_phone: string
          p_points_to_redeem: number
        }
        Returns: Json
      }
      reverse_all_entries_for_order: {
        Args: {
          p_account_id: string
          p_account_type: string
          p_adj_prefix: string
          p_note?: string
          p_operator_id?: string
          p_operator_name?: string
          p_order_id: string
          p_source_prefix: string
        }
        Returns: {
          account_id: string
          account_type: string
          after_balance: number
          amount: number
          before_balance: number
          created_at: string
          id: string
          is_active: boolean
          note: string | null
          operator_id: string | null
          operator_name: string | null
          reversal_of: string | null
          source_id: string | null
          source_type: string
        }
        SetofOptions: {
          from: "*"
          to: "ledger_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_initial_balance_entry: {
        Args: {
          p_account_id: string
          p_account_type: string
          p_new_balance: number
          p_note?: string
          p_operator_id?: string
          p_operator_name?: string
        }
        Returns: {
          account_id: string
          account_type: string
          after_balance: number
          amount: number
          before_balance: number
          created_at: string
          id: string
          is_active: boolean
          note: string | null
          operator_id: string | null
          operator_name: string | null
          reversal_of: string | null
          source_id: string | null
          source_type: string
        }
        SetofOptions: {
          from: "*"
          to: "ledger_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      signup_employee:
        | {
            Args: {
              p_password: string
              p_real_name: string
              p_username: string
            }
            Returns: {
              assigned_role: Database["public"]["Enums"]["app_role"]
              assigned_status: string
              employee_id: string
              error_code: string
              success: boolean
            }[]
          }
        | {
            Args: {
              p_invitation_code?: string
              p_password: string
              p_real_name: string
              p_username: string
            }
            Returns: {
              assigned_role: Database["public"]["Enums"]["app_role"]
              assigned_status: string
              employee_id: string
              error_code: string
              success: boolean
            }[]
          }
      soft_delete_ledger_entry: {
        Args: {
          p_account_id: string
          p_account_type: string
          p_note?: string
          p_operator_id?: string
          p_operator_name?: string
          p_source_id: string
          p_source_type: string
        }
        Returns: {
          account_id: string
          account_type: string
          after_balance: number
          amount: number
          before_balance: number
          created_at: string
          id: string
          is_active: boolean
          note: string | null
          operator_id: string | null
          operator_name: string | null
          reversal_of: string | null
          source_id: string | null
          source_type: string
        }
        SetofOptions: {
          from: "*"
          to: "ledger_transactions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      validate_api_key: {
        Args: { p_endpoint: string; p_ip_address: string; p_key_hash: string }
        Returns: {
          api_key_id: string
          error_code: string
          is_valid: boolean
          key_name: string
          permissions: Json
          rate_remaining: number
        }[]
      }
      verify_employee_login: {
        Args: { p_password: string; p_username: string }
        Returns: {
          employee_id: string
          real_name: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          username: string
        }[]
      }
      verify_employee_login_detailed: {
        Args: { p_password: string; p_username: string }
        Returns: {
          employee_id: string
          error_code: string
          is_super_admin: boolean
          real_name: string
          role: Database["public"]["Enums"]["app_role"]
          status: string
          username: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "staff"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "staff"],
    },
  },
} as const
