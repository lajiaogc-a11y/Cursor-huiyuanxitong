/**
 * 数据库连接 - 唯一可创建 Supabase 客户端的地方
 * Repository 层通过此模块获取客户端
 */
import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

const hasServiceRoleKey = !!(config.supabase.serviceRoleKey && config.supabase.serviceRoleKey.length > 10);
console.log('[DEBUG db] SUPABASE_SERVICE_ROLE_KEY:', hasServiceRoleKey ? 'SET (length=' + config.supabase.serviceRoleKey!.length + ')' : 'MISSING or invalid');

export const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);
