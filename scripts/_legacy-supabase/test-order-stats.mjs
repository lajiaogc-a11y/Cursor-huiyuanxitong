#!/usr/bin/env node
/** 测试 get_order_filter_stats 返回值，验证交易用户是否统计正确 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_REF = 'dhlwefrcowefvbxutsmc';

function loadEnv() {
  try {
    const envPath = join(__dirname, '..', '.env');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch (_) {}
}
loadEnv();

async function main() {
  const password = process.env.DATABASE_PASSWORD?.trim();
  if (!password) {
    console.error('❌ 需要 DATABASE_PASSWORD（.env）');
    process.exit(1);
  }
  const DATABASE_URL = `postgresql://postgres:${encodeURIComponent(password)}@db.${PROJECT_REF}.supabase.co:5432/postgres`;
  const client = new pg.Client({ connectionString: DATABASE_URL });

  try {
    await client.connect();

    // 1. 直接查 orders 表：有多少订单、多少已完成
    const ordersCheck = await client.query(`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN (phone_number IS NOT NULL AND TRIM(phone_number) != '') THEN 1 END) as with_phone
      FROM orders WHERE is_deleted = false
    `);
    console.log('\n=== orders 表概览 ===');
    console.log(ordersCheck.rows[0]);

    // 2. 有有效手机号的订单（order.phone 或 member.phone）
    const phoneCheck = await client.query(`
      SELECT COUNT(DISTINCT COALESCE(NULLIF(TRIM(o.phone_number), ''), m.phone_number)) as unique_phones
      FROM orders o
      LEFT JOIN members m ON o.member_id = m.id
      WHERE o.is_deleted = false
        AND (COALESCE(NULLIF(TRIM(o.phone_number), ''), m.phone_number) IS NOT NULL)
        AND TRIM(COALESCE(NULLIF(TRIM(o.phone_number), ''), m.phone_number)) != ''
    `);
    console.log('\n=== 应有交易用户数（去重手机号）===');
    console.log(phoneCheck.rows[0]);

    // 3. 调用 get_order_filter_stats（全量，无筛选，使用默认值）
    const rpcResult = await client.query(`SELECT * FROM get_order_filter_stats()`);
    console.log('\n=== get_order_filter_stats 返回值 ===');
    console.log(rpcResult.rows[0]);
    console.log('\n交易用户(trading_users):', rpcResult.rows[0]?.trading_users ?? '无此字段');

    // 4. 测试仪表盘 get_dashboard_trend_data（近30天）
    const dEnd = new Date();
    const dStart = new Date();
    dStart.setDate(dStart.getDate() - 30);
    const dashResult = await client.query(`
      SELECT * FROM get_dashboard_trend_data($1::timestamptz, $2::timestamptz, NULL)
      WHERE day_date IS NULL
    `, [dStart.toISOString(), dEnd.toISOString()]);
    console.log('\n=== 仪表盘汇总（近30天已完成订单）===');
    console.log(dashResult.rows[0] || '无汇总行');

    // 5. 测试「全部」日期范围（2000-01-01 至 今天）
    const allStart = new Date(2000, 0, 1);
    const allEnd = new Date();
    const dashAllResult = await client.query(`
      SELECT * FROM get_dashboard_trend_data($1::timestamptz, $2::timestamptz, NULL)
      WHERE day_date IS NULL
    `, [allStart.toISOString(), allEnd.toISOString()]);
    console.log('\n=== 仪表盘汇总（全部时间）===');
    console.log(dashAllResult.rows[0] || '无汇总行');
  } catch (err) {
    console.error('✗ 错误:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
