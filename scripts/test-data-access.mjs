#!/usr/bin/env node
/**
 * 测试登录后数据访问 - 验证会员、订单等 API 是否返回数据
 * 用法: node scripts/test-data-access.mjs [username] [password]
 */
const username = process.argv[2] || 'wangchao';
const password = process.argv[3] || 'Aa5201314.';
const API_BASE = process.env.API_BASE || 'http://localhost:3001';

async function testDataAccess() {
  console.log('=== 数据访问测试 ===');
  console.log('API 地址:', API_BASE);
  console.log('用户名:', username);
  console.log('');

  try {
    // 1. 健康检查
    const healthRes = await fetch(`${API_BASE}/health`);
    if (!healthRes.ok) {
      console.error('❌ 后端未启动');
      process.exit(1);
    }

    // 2. 登录
    const loginRes = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const loginData = await loginRes.json();

    if (!loginData.success || !loginData.token) {
      console.error('❌ 登录失败:', loginData);
      process.exit(1);
    }

    const token = loginData.token;
    const user = loginData.user || {};
    console.log('✓ 登录成功:', user.real_name || user.username);
    console.log('  tenant_id:', user.tenant_id || '(null)');
    console.log('  is_platform_super_admin:', user.is_platform_super_admin);
    console.log('');

    const headers = { Authorization: `Bearer ${token}` };

    // 3. /me
    const meRes = await fetch(`${API_BASE}/api/auth/me`, { headers });
    const meData = await meRes.json();
    const tenantId = meData.user?.tenant_id || user.tenant_id;

    console.log('--- /me ---');
    console.log('  tenant_id:', tenantId);
    console.log('  is_platform_super_admin:', meData.user?.is_platform_super_admin);
    console.log('');

    // 4. 会员列表 - 租户员工用自身 tenant_id，平台管理员需传 query
    const membersUrl = tenantId
      ? `${API_BASE}/api/members?tenant_id=${tenantId}&limit=10`
      : `${API_BASE}/api/members?limit=10`;
    console.log('--- 会员 API ---');
    console.log('  URL:', membersUrl);

    const membersRes = await fetch(membersUrl, { headers });
    const membersData = await membersRes.json();

    if (!membersRes.ok) {
      console.log('  ❌ 状态:', membersRes.status, membersData);
    } else {
      const list = membersData.data || [];
      console.log('  ✓ 会员数:', Array.isArray(list) ? list.length : 0);
      if (list.length > 0) {
        console.log('  示例:', list[0]?.phone_number || list[0]?.member_code || list[0]);
      }
    }
    console.log('');

    // 5. 订单 - 需要 tenant_id
    const ordersUrl = tenantId
      ? `${API_BASE}/api/orders/full?tenant_id=${tenantId}`
      : `${API_BASE}/api/orders/full`;
    console.log('--- 订单 API ---');
    console.log('  URL:', ordersUrl);

    const ordersRes = await fetch(ordersUrl, { headers });
    const ordersData = await ordersRes.json();

    if (!ordersRes.ok) {
      console.log('  ❌ 状态:', ordersRes.status, ordersData);
    } else {
      const list = ordersData.data || [];
      console.log('  ✓ 订单数:', Array.isArray(list) ? list.length : 0);
      if (list.length > 0) {
        console.log('  示例:', list[0]?.order_number || list[0]?.id);
      }
    }
    console.log('');

    // 6. 租户列表（仅平台管理员）
    const tenantsRes = await fetch(`${API_BASE}/api/tenants`, { headers });
    const tenantsData = await tenantsRes.json();
    if (tenantsRes.ok && tenantsData.data) {
      console.log('--- 租户 API ---');
      console.log('  租户数:', tenantsData.data.length);
      if (tenantsData.data.length > 0) {
        console.log('  租户列表:', tenantsData.data.map((t) => t.tenant_code).join(', '));
      }
      console.log('');
    }

    // 7. 操作日志
    console.log('--- 操作日志 API ---');
    const opLogsRes = await fetch(`${API_BASE}/api/data/operation-logs?page=1&pageSize=10`, { headers });
    const opLogsData = await opLogsRes.json();
    if (!opLogsRes.ok) {
      console.log('  ❌ 状态:', opLogsRes.status, opLogsData);
    } else {
      const payload = opLogsData.data || opLogsData;
      const logs = payload?.logs ?? [];
      const total = payload?.totalCount ?? 0;
      console.log('  ✓ 操作日志:', logs.length, '/ 总数:', total);
      if (logs.length > 0) {
        console.log('  示例:', logs[0]?.operatorAccount || logs[0]?.operator_account, logs[0]?.operator_account, logs[0]?.timestamp);
      }
    }
    console.log('');

    // 8. 登录日志
    console.log('--- 登录日志 API ---');
    const loginLogsRes = await fetch(`${API_BASE}/api/data/login-logs?limit=10`, { headers });
    const loginLogsData = await loginLogsRes.json();
    if (!loginLogsRes.ok) {
      console.log('  ❌ 状态:', loginLogsRes.status, loginLogsData);
    } else {
      const arr = loginLogsData.data ?? loginLogsData;
      const list = Array.isArray(arr) ? arr : [];
      console.log('  ✓ 登录日志:', list.length);
      if (list.length > 0) {
        console.log('  示例:', list[0]?.employee_name || list[0]?.login_time);
      }
    }
    console.log('');

    // 9. 公司文档分类
    const tenantParam = tenantId ? `?tenant_id=${tenantId}` : '';
    console.log('--- 公司文档分类 API ---');
    const catRes = await fetch(`${API_BASE}/api/data/knowledge/categories${tenantParam}`, { headers });
    const catData = await catRes.json();
    if (!catRes.ok) {
      console.log('  ❌ 状态:', catRes.status, catData);
    } else {
      const arr = catData.data ?? catData;
      const list = Array.isArray(arr) ? arr : [];
      console.log('  ✓ 分类数:', list.length);
      if (list.length > 0) {
        console.log('  示例:', list[0]?.name);
      }
    }
    console.log('');

    console.log('=== 测试完成 ===');
  } catch (err) {
    console.error('❌ 错误:', err.message);
    process.exit(1);
  }
}

testDataAccess();
