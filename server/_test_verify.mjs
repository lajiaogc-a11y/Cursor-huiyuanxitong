import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const pool = mysql.createPool({
  host: 'localhost', port: 3306, user: 'root',
  password: 'Aa5201314.', database: 'gc_member_system',
});

try {
  // List ALL admin employees and their password status
  const [rows] = await pool.execute(
    "SELECT id, username, role, status, LEFT(password_hash, 10) as hash_prefix, LENGTH(password_hash) as hash_len FROM employees WHERE role = 'admin'"
  );
  console.log('All admin employees:');
  for (const r of rows) {
    console.log(`  ${r.username} | role=${r.role} | status=${r.status} | hash_len=${r.hash_len} | prefix=${r.hash_prefix}`);
  }

  // Test wangchao specifically
  const [wc] = await pool.execute("SELECT password_hash FROM employees WHERE username = 'wangchao'");
  if (wc[0]) {
    const hash = wc[0].password_hash;
    console.log('\n--- Testing wangchao ---');
    console.log('Full hash:', hash);
    
    // Test multiple possible passwords
    for (const pwd of ['123456', 'Aa5201314.', 'admin', 'wangchao', '111111', '123456789']) {
      const match = await bcrypt.compare(pwd, hash);
      console.log(`  Password '${pwd}' => ${match ? 'MATCH ✓' : 'no match'}`);
    }
  }

  // Also check if wangchao's p_password field differs from admin login
  const [loginTest] = await pool.execute(
    "SELECT id, username, password_hash, status FROM employees WHERE username = 'wangchao' AND status = 'active'"
  );
  console.log('\nLogin test result:', loginTest.length > 0 ? 'Found active employee' : 'NOT FOUND');

} catch (e) {
  console.error('Error:', e.message);
} finally {
  await pool.end();
}
