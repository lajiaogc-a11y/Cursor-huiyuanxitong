const mysql = require('mysql2/promise');
(async () => {
  const c = await mysql.createConnection({
    host: 'localhost', user: 'root', password: 'Aa5201314.', database: 'gc_member_system'
  });

  const keys = [
    'feeSettings','exchangeRateSettings','rateSettingEntries','quickRates',
    'quickAmounts','countries','copySettings','retentionSettings',
    'cardMerchantSettlements','paymentProviderSettlements','activitySettings',
    'rewardTypeSettings','giftDistributionSettings','trxSettings',
    'usdtLiveRateConfig','usdtLiveRates','points_settings','exchange_rates'
  ];

  console.log('=== shared_data_store values ===');
  const [sds] = await c.query(
    `SELECT store_key, SUBSTRING(store_value,1,200) as val_preview, LENGTH(store_value) as val_len
     FROM shared_data_store WHERE store_key IN (${keys.map(()=>'?').join(',')})`,
    keys
  );
  for (const r of sds) console.log(`${r.store_key} (${r.val_len} bytes):`, r.val_preview);

  console.log('\n=== vendors ===');
  const [v] = await c.query('SELECT id,name,type FROM vendors LIMIT 10');
  for (const r of v) console.log(JSON.stringify(r));

  console.log('\n=== payment_providers ===');
  const [pp] = await c.query('SELECT id,name,type FROM payment_providers LIMIT 10');
  for (const r of pp) console.log(JSON.stringify(r));

  console.log('\n=== extract_settings columns ===');
  const [ec] = await c.query('SHOW COLUMNS FROM extract_settings');
  console.log(ec.map(c => c.Field).join(', '));

  console.log('\n=== vendor_settlements columns ===');
  const [vc] = await c.query('SHOW COLUMNS FROM vendor_settlements');
  console.log(vc.map(c => c.Field).join(', '));

  console.log('\n=== activity_gifts sample ===');
  const [ag] = await c.query('SELECT * FROM activity_gifts LIMIT 2');
  if (ag.length > 0) {
    console.log(JSON.stringify(ag[0]).substring(0, 200));
  }
  console.log('total:', ag.length);

  console.log('\n=== orders phone_number & member_id join test ===');
  const [oj] = await c.query(`
    SELECT o.order_number, o.member_id, m.phone_number, m.member_code, m.name
    FROM orders o
    LEFT JOIN members m ON o.member_id = m.id
    WHERE o.amount > 0
    ORDER BY o.created_at DESC LIMIT 5
  `);
  for (const r of oj) console.log(JSON.stringify(r));

  await c.end();
})().catch(e => console.error('Error:', e.message));
