#!/usr/bin/env node
/**
 * 修复订单 profit_usdt：当手续费(fee)已改为0但 profit_usdt 未正确更新时，按公式重新计算并更新
 * 用法: node scripts/fix-order-profit-usdt.mjs [订单号1] [订单号2] ...
 * 示例: node scripts/fix-order-profit-usdt.mjs 260311DIE14420 260311GZA64271
 */
import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

function getProjectRef() {
  const url = process.env.VITE_SUPABASE_URL || '';
  const m = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return m ? m[1] : process.env.SUPABASE_PROJECT_REF || 'dhlwefrcowefvbxutsmc';
}

async function main() {
  const orderNumbers = process.argv.slice(2).filter(Boolean);
  if (orderNumbers.length === 0) {
    console.log('用法: node scripts/fix-order-profit-usdt.mjs <订单号1> [订单号2] ...');
    console.log('示例: node scripts/fix-order-profit-usdt.mjs 260311DIE14420 260311GZA64271');
    process.exit(1);
  }

  let DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    const password = process.env.DATABASE_PASSWORD?.trim();
    if (!password) {
      console.error('请设置 DATABASE_PASSWORD 环境变量（.env 中）');
      process.exit(1);
    }
    const projectRef = getProjectRef();
    DATABASE_URL = `postgresql://postgres:${encodeURIComponent(password)}@db.${projectRef}.supabase.co:5432/postgres`;
  }

  const client = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await client.connect();

    const placeholders = orderNumbers.map((_, i) => `$${i + 1}`).join(', ');
    const { rows } = await client.query(
      `SELECT id, order_number, currency, amount, actual_payment, fee, foreign_rate, profit_usdt, profit_rate
       FROM orders
       WHERE order_number = ANY($1::text[]) AND currency = 'USDT'`,
      [orderNumbers]
    );

    if (rows.length === 0) {
      console.log('未找到匹配的 USDT 订单:', orderNumbers.join(', '));
      return;
    }

    let updated = 0;
    for (const row of rows) {
      const cardWorth = parseFloat(row.amount) || 0;
      const usdtRate = parseFloat(row.foreign_rate) || 1;
      const actualPayment = parseFloat(row.actual_payment) || 0;
      const fee = parseFloat(row.fee) || 0;
      const totalValueUsdt = usdtRate > 0 ? cardWorth / usdtRate : 0;
      const newProfit = Math.round((totalValueUsdt - actualPayment - fee) * 100) / 100;
      const newRate = totalValueUsdt > 0 ? Math.round((newProfit / totalValueUsdt) * 10000) / 100 : 0;

      const oldProfit = parseFloat(row.profit_usdt) || 0;
      if (Math.abs(newProfit - oldProfit) < 0.01) {
        console.log(`订单 ${row.order_number} 利润已正确 (${oldProfit})`);
        continue;
      }

      await client.query(
        `UPDATE orders SET profit_usdt = $1, profit_rate = $2 WHERE id = $3`,
        [newProfit, newRate, row.id]
      );
      console.log(`✓ 订单 ${row.order_number}: profit_usdt ${oldProfit} → ${newProfit} (fee=${fee})`);
      updated++;
    }

    console.log(`\n共修复 ${updated} 条订单。请刷新数据统计和报表管理页面查看最新数据。`);
  } catch (err) {
    console.error('执行失败:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
