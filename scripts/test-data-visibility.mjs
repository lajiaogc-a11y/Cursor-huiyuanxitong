#!/usr/bin/env node
/**
 * 数据可见性模拟测试 - 验证员工登录后能否看到所有数据
 * 用法: node scripts/test-data-visibility.mjs [username] [password]
 */
const username = process.argv[2] || 'admin';
const password = process.argv[3] || '123456';
const API_BASE = process.env.API_BASE || 'http://localhost:3001';

const tests = [
  { name: '订单(full)', url: '/api/orders/full', key: 'orders' },
  { name: '会员列表', url: '/api/members', key: 'members' },
  { name: '操作日志', url: '/api/logs/audit', key: 'data' },
  { name: '登录日志', url: '/api/logs/login', key: 'data' },
  { name: '公司文档分类', url: '/api/data/knowledge/categories', key: null },
  { name: '报表仪表盘', url: '/api/reports/dashboard', key: null },
  { name: '礼品卡', url: '/api/giftcards/cards', key: 'cards' },
];

function extractCount(res, key) {
  if (Array.isArray(res)) return res.length;
  if (res?.data && Array.isArray(res.data)) return res.data.length;
  if (key && res?.[key] && Array.isArray(res[key])) return res[key].length;
  if (res?.orders && Array.isArray(res.orders)) return res.orders.length;
  if (res?.members && Array.isArray(res.members)) return res.members.length;
  if (res?.cards && Array.isArray(res.cards)) return res.cards.length;
  if (typeof res === 'object' && res !== null && !res.error) return '(有数据)';
  return null;
}

async function main() {
  console.log('=== 数据可见性模拟测试 ===');
  console.log('API:', API_BASE, '| 用户:', username);
  console.log('');

  try {
    const healthRes = await fetch(`${API_BASE}/health`);
    if (!healthRes.ok) {
      console.error('❌ 后端未启动，请先运行: cd server && npm run dev');
      process.exit(1);
    }
    console.log('✓ 后端已启动\n');

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
    const tenantId = loginData.user?.tenant_id;
    const role = loginData.user?.role;
    console.log('✓ 登录成功');
    console.log('  用户:', loginData.user?.real_name || loginData.user?.username);
    console.log('  角色:', role || '(未知)');
    console.log('  tenant_id:', tenantId || '(无)');
    console.log('');

    const headers = { Authorization: `Bearer ${token}` };
    let allPass = true;

    for (const t of tests) {
      try {
        const res = await fetch(`${API_BASE}${t.url}`, { headers });
        const data = await res.json();
        const count = extractCount(data, t.key);
        const ok = res.ok;
        const status = ok ? '✓' : '✗';
        const countStr = count !== null ? ` 数量: ${count}` : '';
        if (!ok) allPass = false;
        console.log(`${status} ${t.name}${countStr} ${!ok ? `(HTTP ${res.status})` : ''}`);
        if (!ok && data?.message) console.log(`    └ ${data.message}`);
      } catch (e) {
        allPass = false;
        console.log(`✗ ${t.name} 请求异常: ${e.message}`);
      }
    }

    // 公司文档文章（需要先有分类）
    const catRes = await fetch(`${API_BASE}/api/data/knowledge/categories`, { headers });
    const catData = await catRes.json();
    const categories = Array.isArray(catData) ? catData : (catData?.data ?? []);
    if (categories.length > 0) {
      const firstId = categories[0].id;
      const artRes = await fetch(`${API_BASE}/api/data/knowledge/articles/${firstId}`, { headers });
      const artData = await artRes.json();
      const articles = Array.isArray(artData) ? artData : (artData?.data ?? []);
      const ok = artRes.ok;
      const status = ok ? '✓' : '✗';
      if (!ok) allPass = false;
      console.log(`${status} 公司文档文章(首分类) 数量: ${articles.length}${!ok ? ` (HTTP ${artRes.status})` : ''}`);
    } else {
      console.log('- 公司文档文章 跳过(无分类)');
    }

    console.log('');
    if (allPass) {
      console.log('=== 数据可见性测试通过：所有接口均返回成功 ===');
    } else {
      console.log('=== 部分接口失败，请检查后端日志和 tenant_id 配置 ===');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ 请求失败:', err.message);
    if (err.cause?.code === 'ECONNREFUSED') {
      console.error('   请先启动后端: cd server && npm run dev');
    }
    process.exit(1);
  }
}

main();
