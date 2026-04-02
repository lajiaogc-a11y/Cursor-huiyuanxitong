const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host: 'localhost', user: 'root', password: 'Aa5201314.', database: 'gc_member_system'
  });

  // 1. List all tables and row counts
  const [tables] = await c.query("SHOW TABLES");
  console.log('=== 所有表及行数 ===');
  for (const t of tables) {
    const tname = Object.values(t)[0];
    const [[{ cnt }]] = await c.query(`SELECT COUNT(*) as cnt FROM \`${tname}\``);
    if (cnt > 0) console.log(`  ${tname}: ${cnt} rows`);
  }

  // 2. Check shared_data_store keys
  console.log('\n=== shared_data_store keys ===');
  const [sds] = await c.query('SELECT store_key, tenant_id, LENGTH(store_value) as val_len FROM shared_data_store ORDER BY store_key');
  for (const row of sds) {
    console.log(`  key=${row.store_key}  tenant=${row.tenant_id}  val_len=${row.val_len}`);
  }

  // 3. Check orders sample
  console.log('\n=== orders sample (last 3) ===');
  const [orders] = await c.query('SELECT id, order_number, card_type, card_value, exchange_rate, actual_payment, amount, rate, profit_ngn, tenant_id, created_at FROM orders ORDER BY created_at DESC LIMIT 3');
  for (const o of orders) console.log(JSON.stringify(o));

  // 4. Check members sample
  console.log('\n=== members sample (first 3) ===');
  const [members] = await c.query('SELECT id, phone, member_code, real_name, preferred_currency, tenant_id FROM members LIMIT 3');
  for (const m of members) console.log(JSON.stringify(m));

  // 5. Check employees
  console.log('\n=== employees ===');
  const [emps] = await c.query('SELECT id, username, real_name, role, is_super_admin, tenant_id, status FROM employees');
  for (const e of emps) console.log(JSON.stringify(e));

  // 6. Check activity types
  console.log('\n=== activity types ===');
  try {
    const [at] = await c.query('SELECT * FROM activity_types LIMIT 5');
    console.log(`  ${at.length} rows`);
    for (const a of at) console.log(`  `, JSON.stringify(a));
  } catch(e) { console.log('  table not found:', e.message.substring(0, 80)); }

  // 7. Check giftcards related
  console.log('\n=== giftcard tables ===');
  for (const tbl of ['giftcard_cards', 'giftcard_vendors', 'giftcard_providers']) {
    try {
      const [[{ cnt }]] = await c.query(`SELECT COUNT(*) as cnt FROM \`${tbl}\``);
      console.log(`  ${tbl}: ${cnt} rows`);
    } catch(e) { console.log(`  ${tbl}: not found`); }
  }

  // 8. Check api_keys and webhooks
  console.log('\n=== api_keys & webhooks ===');
  for (const tbl of ['api_keys', 'webhooks', 'api_request_logs']) {
    try {
      const [[{ cnt }]] = await c.query(`SELECT COUNT(*) as cnt FROM \`${tbl}\``);
      console.log(`  ${tbl}: ${cnt} rows`);
    } catch(e) { console.log(`  ${tbl}: not found`); }
  }

  // 9. Check reports-related counts
  console.log('\n=== reports data ===');
  const [[{ total_orders }]] = await c.query('SELECT COUNT(*) as total_orders FROM orders WHERE (is_deleted = false OR is_deleted IS NULL)');
  const [[{ today_orders }]] = await c.query('SELECT COUNT(*) as today_orders FROM orders WHERE DATE(created_at) = CURDATE() AND (is_deleted = false OR is_deleted IS NULL)');
  const [[{ total_members }]] = await c.query('SELECT COUNT(*) as total_members FROM members');
  console.log(`  total_orders=${total_orders}, today_orders=${today_orders}, total_members=${total_members}`);

  // 10. Check member_activity
  console.log('\n=== member_activity ===');
  try {
    const [[{ cnt }]] = await c.query('SELECT COUNT(*) as cnt FROM member_activity');
    console.log(`  ${cnt} rows`);
    if (cnt > 0) {
      const [sample] = await c.query('SELECT * FROM member_activity LIMIT 2');
      for (const s of sample) console.log(`  `, JSON.stringify(s));
    }
  } catch(e) { console.log('  error:', e.message.substring(0, 80)); }

  // 11. Check points_accounts / points related tables
  console.log('\n=== points tables ===');
  for (const tbl of ['points_accounts', 'points_transactions', 'points_mall_items', 'points_mall_orders']) {
    try {
      const [[{ cnt }]] = await c.query(`SELECT COUNT(*) as cnt FROM \`${tbl}\``);
      console.log(`  ${tbl}: ${cnt} rows`);
    } catch(e) { console.log(`  ${tbl}: not found`); }
  }

  // 12. Check phone_pool
  console.log('\n=== phone_pool ===');
  try {
    const [[{ cnt }]] = await c.query('SELECT COUNT(*) as cnt FROM phone_pool');
    console.log(`  ${cnt} rows`);
  } catch(e) { console.log('  not found'); }

  // 13. Check settlements/merchant related
  console.log('\n=== settlement tables ===');
  for (const tbl of ['settlements', 'merchant_settlements', 'payment_settlements']) {
    try {
      const [[{ cnt }]] = await c.query(`SELECT COUNT(*) as cnt FROM \`${tbl}\``);
      console.log(`  ${tbl}: ${cnt} rows`);
    } catch(e) { console.log(`  ${tbl}: not found`); }
  }

  // 14. Check tenants
  console.log('\n=== tenants ===');
  const [tenants] = await c.query('SELECT id, tenant_code, tenant_name FROM tenants');
  for (const t of tenants) console.log(`  `, JSON.stringify(t));

  // 15. Check what columns exist on orders
  console.log('\n=== orders columns ===');
  const [cols] = await c.query('SHOW COLUMNS FROM orders');
  console.log(cols.map(c => c.Field).join(', '));

  // 16. Check knowledge base
  console.log('\n=== knowledge tables ===');
  for (const tbl of ['knowledge_articles', 'knowledge_categories']) {
    try {
      const [[{ cnt }]] = await c.query(`SELECT COUNT(*) as cnt FROM \`${tbl}\``);
      console.log(`  ${tbl}: ${cnt} rows`);
    } catch(e) { console.log(`  ${tbl}: not found`); }
  }

  await c.end();
  console.log('\n检查完成');
})().catch(e => console.error('Fatal:', e.message));
