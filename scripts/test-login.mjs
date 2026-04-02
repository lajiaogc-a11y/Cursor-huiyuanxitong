#!/usr/bin/env node
/**
 * 模拟登录测试 - 验证后端 API 和前端逻辑
 * 用法: node scripts/test-login.mjs [username] [password]
 */
const username = process.argv[2] || 'admin';
const password = process.argv[3] || '123456';
const API_BASE = process.env.API_BASE || 'http://localhost:3001';

async function testLogin() {
  console.log('=== 登录 API 测试 ===');
  console.log('API 地址:', API_BASE);
  console.log('用户名:', username);
  console.log('');

  try {
    // 1. 健康检查
    const healthRes = await fetch(`${API_BASE}/health`);
    if (!healthRes.ok) {
      console.error('❌ 后端未启动或不可达，请先运行: cd server && npm run dev');
      process.exit(1);
    }
    console.log('✓ 后端健康检查通过');

    // 2. 登录
    const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const loginData = await loginRes.json();

    if (!loginRes.ok) {
      console.error('❌ 登录失败:', loginRes.status, loginData);
      process.exit(1);
    }

    if (!loginData.success || !loginData.token) {
      console.error('❌ 登录返回异常:', loginData);
      process.exit(1);
    }

    console.log('✓ 登录成功');
    console.log('  用户:', loginData.user?.real_name || loginData.user?.username);
    console.log('  Token:', loginData.token?.slice(0, 20) + '...');

    // 3. 验证 /me
    const meRes = await fetch(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${loginData.token}` },
    });
    const meData = await meRes.json();

    if (!meRes.ok) {
      console.error('❌ /me 验证失败:', meRes.status, meData);
      process.exit(1);
    }
    console.log('✓ /me 验证通过');

    console.log('');
    console.log('=== 测试通过，后端登录流程正常 ===');
  } catch (err) {
    console.error('❌ 请求失败:', err.message);
    if (err.cause?.code === 'ECONNREFUSED') {
      console.error('   请先启动后端: cd server && npm run dev');
    }
    process.exit(1);
  }
}

testLogin();
