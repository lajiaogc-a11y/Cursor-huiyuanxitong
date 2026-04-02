const BASE = 'https://api.fastgc.cc';

async function test() {
  // 1. Login on LIVE API
  console.log('=== Login on LIVE API ===');
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'wangchao', password: '123456' }),
  });
  const loginData = await loginRes.json();
  console.log('Status:', loginRes.status);
  console.log('Success:', loginData.success);

  if (loginData.success && loginData.token) {
    console.log('User role:', loginData.user?.role);
    console.log('is_super_admin:', loginData.user?.is_super_admin);

    // Decode JWT payload
    const parts = loginData.token.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    console.log('\nJWT payload:');
    console.log('  role:', payload.role);
    console.log('  username:', payload.username);
    console.log('  is_super_admin:', payload.is_super_admin);
    console.log('  is_platform_super_admin:', payload.is_platform_super_admin);

    // 2. Try publish settings
    console.log('\n=== Test Publish ===');
    const pubRes = await fetch(`${BASE}/api/member-portal-settings/versions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${loginData.token}`,
      },
      body: JSON.stringify({ payload: {}, note: 'test' }),
    });
    const pubData = await pubRes.json();
    console.log('Publish status:', pubRes.status);
    console.log('Publish response:', JSON.stringify(pubData));
  } else {
    console.log('Login failed:', loginData.error || 'Unknown error');
  }
}

test().catch(e => console.error('Error:', e.message));
