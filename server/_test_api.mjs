// Step 1: Login as wangchao to get JWT
// Step 2: Call verify-password with that JWT
const BASE = 'http://localhost:3001';

async function test() {
  // 1. Login
  console.log('=== Step 1: Login ===');
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'wangchao', password: '123456' }),
  });
  const loginData = await loginRes.json();
  console.log('Login status:', loginRes.status);
  console.log('Login response:', JSON.stringify(loginData, null, 2));

  if (!loginData.success && !loginData.token && !loginData.data?.token) {
    console.log('LOGIN FAILED - cannot proceed');
    return;
  }

  const token = loginData.token || loginData.data?.token;
  console.log('Token:', token ? token.substring(0, 30) + '...' : 'NO TOKEN');

  // 2. Verify password
  console.log('\n=== Step 2: Verify Password ===');
  const verifyRes = await fetch(`${BASE}/api/admin/verify-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ password: '123456' }),
  });
  const verifyData = await verifyRes.json();
  console.log('Verify status:', verifyRes.status);
  console.log('Verify response:', JSON.stringify(verifyData, null, 2));
}

test().catch(e => console.error('Error:', e.message));
