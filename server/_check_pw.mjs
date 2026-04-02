import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';

const pool = mysql.createPool({
  host: 'localhost', port: 3306, user: 'root',
  password: 'Aa5201314.', database: 'gc_member_system',
});

try {
  const [rows] = await pool.execute(
    "SELECT id, username, role, status, password_hash FROM employees WHERE username = 'wangchao'"
  );
  const emp = rows[0];
  if (!emp) { console.log('ERROR: wangchao not found!'); process.exit(1); }

  console.log('Username:', emp.username);
  console.log('Role:', emp.role);
  console.log('Status:', emp.status);
  console.log('Hash length:', emp.password_hash?.length || 0);
  console.log('Hash prefix:', emp.password_hash?.substring(0, 20));

  const testPassword = '123456';
  const stored = (emp.password_hash || '').trim();

  if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
    const match = await bcrypt.compare(testPassword, stored);
    console.log(`\nbcrypt compare '${testPassword}' => ${match}`);
  } else {
    const crypto = await import('crypto');
    const shaHex = crypto.createHash('sha256').update(testPassword, 'utf8').digest('hex');
    const shaMatch = stored.toLowerCase() === shaHex.toLowerCase();
    console.log(`\nSHA256 compare => ${shaMatch}`);
    console.log('Stored hash:', stored);
    console.log('SHA256 of 123456:', shaHex);
  }

  // If password doesn't match, reset it to bcrypt hash of 123456
  const newHash = await bcrypt.hash(testPassword, 10);
  console.log('\nNew bcrypt hash for 123456:', newHash);
  
  // Verify the new hash works
  const verifyNew = await bcrypt.compare(testPassword, newHash);
  console.log('Verify new hash:', verifyNew);

} catch (e) {
  console.error('Error:', e.message);
} finally {
  await pool.end();
}
