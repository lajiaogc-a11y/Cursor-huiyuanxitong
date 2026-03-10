/**
 * 数据库迁移导出服务
 * 用于导出完整的数据库结构和数据
 */

import { supabase } from '@/integrations/supabase/client';
import JSZip from 'jszip';
import {
  TABLE_SCHEMAS,
  DATABASE_FUNCTIONS,
  generateInsertSQL,
  generateFullSchemaSQL,
  generateImportGuide,
  getAllTableNames,
} from '@/lib/sqlGenerator';

// 导出进度回调
export interface MigrationProgress {
  phase: 'schema' | 'functions' | 'data' | 'packaging' | 'verification';
  currentTable?: string;
  current: number;
  total: number;
  message: string;
}

// 校验报告
export interface VerificationReport {
  export_time: string;
  tables: { name: string; row_count: number; checksums?: Record<string, number> }[];
  total_records: number;
  schema_tables: number;
}

// 导出选项
export interface MigrationExportOptions {
  includeSchema: boolean;
  includeFunctions: boolean;
  includePolicies: boolean;
  includeData: boolean;
  includeIndexes: boolean;
  format: 'sql' | 'json';
  onProgress?: (progress: MigrationProgress) => void;
}

// 需要导出的表列表（按依赖顺序排列）
const EXPORT_TABLES = [
  // 基础配置表（无外键依赖）
  'currencies',
  'customer_sources',
  'activity_types',
  'activity_reward_tiers',
  'card_types',
  'cards',
  'vendors',
  'payment_providers',
  'shared_data_store',
  'data_settings',
  'navigation_config',
  'report_titles',
  'shift_receivers',
  
  // 用户相关表
  'employees',
  'profiles',
  'employee_permissions',
  'employee_name_history',
  'employee_login_logs',
  
  // 权限相关表
  'role_permissions',
  'permission_versions',
  'permission_change_logs',
  
  // 会员相关表
  'members',
  'member_activity',
  'points_accounts',
  'referral_relations',
  
  // 业务数据表
  'orders',
  'points_ledger',
  'points_summary',
  'activity_gifts',
  'audit_records',
  'shift_handovers',
  'balance_change_logs',
  'operation_logs',
  
  // 知识库表
  'knowledge_categories',
  'knowledge_articles',
  'knowledge_read_status',
  
  // API 相关表
  'api_keys',
  'api_rate_limits',
  'api_request_logs',
  'webhooks',
  'webhook_delivery_logs',
  'webhook_event_queue',
  
  // 用户数据表
  'user_data_store',
  'exchange_rate_state',
];

// 批量获取表数据
async function fetchTableData(tableName: string): Promise<any[]> {
  const BATCH_SIZE = 1000;
  let allData: any[] = [];
  let offset = 0;
  
  // 使用类型断言来处理动态表名
  const tableQuery = supabase.from(tableName as any);
  
  while (true) {
    try {
      const { data, error } = await tableQuery
        .select('*')
        .range(offset, offset + BATCH_SIZE - 1);
      
      if (error) {
        console.error(`Error fetching ${tableName}:`, error);
        break;
      }
      
      if (!data || data.length === 0) {
        break;
      }
      
      allData = allData.concat(data);
      offset += BATCH_SIZE;
      
      // 如果返回的数据少于批次大小，说明已经是最后一批
      if (data.length < BATCH_SIZE) {
        break;
      }
    } catch (err) {
      console.error(`Error fetching ${tableName}:`, err);
      break;
    }
  }
  
  return allData;
}

// 生成索引 SQL
function generateIndexesSQL(): string {
  return `-- ============================================
-- Database Indexes
-- Generated: ${new Date().toISOString()}
-- ============================================

-- Employees indexes
CREATE INDEX IF NOT EXISTS idx_employees_username ON public.employees(username);
CREATE INDEX IF NOT EXISTS idx_employees_status ON public.employees(status);

-- Members indexes
CREATE INDEX IF NOT EXISTS idx_members_phone_number ON public.members(phone_number);
CREATE INDEX IF NOT EXISTS idx_members_member_code ON public.members(member_code);

-- Orders indexes
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);
CREATE INDEX IF NOT EXISTS idx_orders_phone_number ON public.orders(phone_number);
CREATE INDEX IF NOT EXISTS idx_orders_member_id ON public.orders(member_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);

-- Points ledger indexes
CREATE INDEX IF NOT EXISTS idx_points_ledger_member_code ON public.points_ledger(member_code);
CREATE INDEX IF NOT EXISTS idx_points_ledger_member_id ON public.points_ledger(member_id);
CREATE INDEX IF NOT EXISTS idx_points_ledger_order_id ON public.points_ledger(order_id);

-- Points accounts indexes
CREATE INDEX IF NOT EXISTS idx_points_accounts_member_code ON public.points_accounts(member_code);
CREATE INDEX IF NOT EXISTS idx_points_accounts_phone ON public.points_accounts(phone);

-- Member activity indexes
CREATE INDEX IF NOT EXISTS idx_member_activity_member_id ON public.member_activity(member_id);
CREATE INDEX IF NOT EXISTS idx_member_activity_phone_number ON public.member_activity(phone_number);

-- Operation logs indexes
CREATE INDEX IF NOT EXISTS idx_operation_logs_timestamp ON public.operation_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_operation_logs_module ON public.operation_logs(module);
CREATE INDEX IF NOT EXISTS idx_operation_logs_operator_id ON public.operation_logs(operator_id);

-- API request logs indexes
CREATE INDEX IF NOT EXISTS idx_api_request_logs_created_at ON public.api_request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_api_request_logs_api_key_id ON public.api_request_logs(api_key_id);

-- Knowledge articles indexes
CREATE INDEX IF NOT EXISTS idx_knowledge_articles_category_id ON public.knowledge_articles(category_id);
`;
}

// 生成 RLS 策略 SQL（简化版）
function generatePoliciesSQL(): string {
  return `-- ============================================
-- Row Level Security Policies
-- Generated: ${new Date().toISOString()}
-- NOTE: These policies are designed for Supabase.
-- If not using Supabase, you may skip this file.
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.points_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_records ENABLE ROW LEVEL SECURITY;

-- Note: Full RLS policies are complex and depend on your auth setup.
-- Please refer to the original Supabase project for complete policy definitions.
-- The above statements just enable RLS; actual policies need to be defined
-- based on your authentication and authorization requirements.
`;
}

// 主导出函数
export async function exportFullDatabase(
  options: MigrationExportOptions
): Promise<{ success: boolean; filename?: string; error?: string; verificationReport?: VerificationReport }> {
  const {
    includeSchema,
    includeFunctions,
    includePolicies,
    includeData,
    includeIndexes,
    format,
    onProgress,
  } = options;
  
  try {
    const zip = new JSZip();
    const timestamp = new Date().toISOString().split('T')[0];
    const verificationReport: VerificationReport = {
      export_time: new Date().toISOString(),
      tables: [],
      total_records: 0,
      schema_tables: EXPORT_TABLES.filter(t => TABLE_SCHEMAS[t]).length,
    };
    
    // 1. 导出 Schema
    if (includeSchema) {
      onProgress?.({ phase: 'schema', current: 1, total: 1, message: '正在导出表结构...' });
      const schemaSQL = generateFullSchemaSQL();
      zip.file('01_schema.sql', schemaSQL);
    }
    
    // 2. 导出 Functions
    if (includeFunctions) {
      onProgress?.({ phase: 'functions', current: 1, total: 1, message: '正在导出数据库函数...' });
      zip.file('02_functions.sql', DATABASE_FUNCTIONS);
    }
    
    // 3. 导出 RLS Policies
    if (includePolicies) {
      zip.file('03_policies.sql', generatePoliciesSQL());
    }
    
    // 4. 导出 Indexes
    if (includeIndexes) {
      zip.file('04_indexes.sql', generateIndexesSQL());
    }
    
    // 5. 导出数据
    if (includeData) {
      const tablesToExport = EXPORT_TABLES.filter(t => TABLE_SCHEMAS[t]);
      let allDataSQL = `-- ============================================\n-- Database Data Export\n-- Generated: ${new Date().toISOString()}\n-- Tables: ${tablesToExport.length}\n-- ============================================\n\n`;
      
      const dataFolder = zip.folder('data');
      
      for (let i = 0; i < tablesToExport.length; i++) {
        const tableName = tablesToExport[i];
        
        onProgress?.({
          phase: 'data',
          currentTable: tableName,
          current: i + 1,
          total: tablesToExport.length,
          message: `正在导出表 ${tableName}...`,
        });
        
        try {
          const data = await fetchTableData(tableName);
          
          const tableVerification: { name: string; row_count: number; checksums?: Record<string, number> } = {
            name: tableName,
            row_count: data.length,
          };
          
          // 关键金额字段校验
          if (tableName === 'orders' && data.length > 0) {
            tableVerification.checksums = {
              total_amount: data.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0),
              total_profit_ngn: data.reduce((s: number, r: any) => s + (Number(r.profit_ngn) || 0), 0),
              total_profit_usdt: data.reduce((s: number, r: any) => s + (Number(r.profit_usdt) || 0), 0),
            };
          } else if (tableName === 'balance_change_logs' && data.length > 0) {
            tableVerification.checksums = {
              total_change_amount: data.reduce((s: number, r: any) => s + (Number(r.change_amount) || 0), 0),
            };
          } else if (tableName === 'activity_gifts' && data.length > 0) {
            tableVerification.checksums = {
              total_amount: data.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0),
              total_gift_value: data.reduce((s: number, r: any) => s + (Number(r.gift_value) || 0), 0),
            };
          }
          
          verificationReport.tables.push(tableVerification);
          verificationReport.total_records += data.length;
          
          if (data.length > 0) {
            allDataSQL += generateInsertSQL(tableName, data);
            allDataSQL += '\n';
            if (format === 'json' || format === 'sql') {
              dataFolder?.file(`${tableName}.json`, JSON.stringify(data, null, 2));
            }
          } else {
            allDataSQL += `-- Table: ${tableName} (no data)\n\n`;
          }
        } catch (err) {
          console.error(`Error exporting ${tableName}:`, err);
          allDataSQL += `-- Table: ${tableName} (export error)\n\n`;
          verificationReport.tables.push({ name: tableName, row_count: -1 });
        }
      }
      
      zip.file('05_data.sql', allDataSQL);
    }
    
    // 6. 添加校验报告
    onProgress?.({ phase: 'verification', current: 1, total: 1, message: '正在生成校验报告...' });
    zip.file('VERIFICATION_REPORT.json', JSON.stringify(verificationReport, null, 2));
    
    // 7. 添加导入指南
    zip.file('IMPORT_GUIDE.md', generateImportGuide());
    
    // 8. 添加配置信息
    const config = {
      exportTime: new Date().toISOString(),
      tables: EXPORT_TABLES.filter(t => TABLE_SCHEMAS[t]).length,
      options: { includeSchema, includeFunctions, includePolicies, includeData, includeIndexes, format },
    };
    zip.file('config.json', JSON.stringify(config, null, 2));
    
    // 9. 打包并下载
    onProgress?.({ phase: 'packaging', current: 1, total: 1, message: '正在打包文件...' });
    
    const blob = await zip.generateAsync({ type: 'blob' });
    const filename = `database_migration_${timestamp}.zip`;
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    return { success: true, filename, verificationReport };
  } catch (error) {
    console.error('Migration export error:', error);
    return { success: false, error: error instanceof Error ? error.message : '导出失败' };
  }
}

// 获取数据库统计信息
export async function getDatabaseStats(): Promise<{
  tableCount: number;
  tables: { name: string; count: number }[];
}> {
  const tables: { name: string; count: number }[] = [];
  
  for (const tableName of EXPORT_TABLES) {
    if (!TABLE_SCHEMAS[tableName]) continue;
    
    try {
      const { count, error } = await supabase
        .from(tableName as any)
        .select('*', { count: 'exact', head: true });
      
      tables.push({
        name: tableName,
        count: error ? 0 : (count || 0),
      });
    } catch {
      tables.push({ name: tableName, count: 0 });
    }
  }
  
  return {
    tableCount: tables.length,
    tables,
  };
}
