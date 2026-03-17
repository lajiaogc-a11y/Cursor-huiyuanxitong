/**
 * PostgreSQL 直连 - 绕过 RLS，用于会员/订单等数据查询
 * 当 SUPABASE_SERVICE_ROLE_KEY 为 anon key 时，Supabase 客户端受 RLS 限制会返回空
 * 使用数据库直连可绕过此限制
 */
import pg from 'pg';
import { config } from '../config/index.js';

let pool: pg.Pool | null = null;

function getProjectRef(): string {
  const url = config.supabase.url || '';
  const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return m ? m[1] : process.env.SUPABASE_PROJECT_REF || 'dhlwefrcowefvbxutsmc';
}

export function getDatabaseUrl(): string | null {
  const url = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.POSTGRES_URL;
  if (url) return url;
  const password = (process.env.DATABASE_PASSWORD || '').trim();
  if (!password) return null;
  const projectRef = getProjectRef();
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`;
}

export function getPgPool(): pg.Pool | null {
  if (pool) return pool;
  const url = getDatabaseUrl();
  if (!url) return null;
  pool = new pg.Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    max: 5,
  });
  return pool;
}

export async function queryPg<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const p = getPgPool();
  if (!p) throw new Error('DATABASE_URL 或 DATABASE_PASSWORD 未配置');
  const { rows } = await p.query(sql, params);
  return rows;
}
