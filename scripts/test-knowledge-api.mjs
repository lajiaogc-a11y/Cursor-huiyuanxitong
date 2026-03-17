#!/usr/bin/env node
/**
 * 测试公司文档 API - 验证分类和文章能否正常返回
 * 用法: node scripts/test-knowledge-api.mjs [username] [password]
 */
const username = process.argv[2] || 'admin';
const password = process.argv[3] || '123456';
const API_BASE = process.env.API_BASE || 'http://localhost:3001';

async function main() {
  console.log('=== 公司文档 API 测试 ===');
  console.log('API:', API_BASE, '| 用户:', username);
  console.log('');

  try {
    const healthRes = await fetch(`${API_BASE}/health`);
    if (!healthRes.ok) {
      console.error('❌ 后端未启动，请先运行: cd server && npm run dev');
      process.exit(1);
    }
    console.log('✓ 后端已启动');

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
    console.log('✓ 登录成功:', loginData.user?.real_name || loginData.user?.username, '| tenant:', tenantId || '(无)');

    const headers = { Authorization: `Bearer ${token}` };

    const catRes = await fetch(`${API_BASE}/api/data/knowledge/categories${tenantId ? `?tenant_id=${tenantId}` : ''}`, { headers });
    const catRaw = await catRes.json();
    const categories = Array.isArray(catRaw) ? catRaw : (catRaw?.data ?? []);
    if (!catRes.ok) {
      console.error('❌ 分类 API 失败:', catRes.status, catRaw);
      process.exit(1);
    }
    console.log('✓ 分类数量:', categories.length);
    if (categories.length === 0) {
      console.log('  提示: 分类为空，请运行 npm run db:seed-knowledge-migration');
    } else {
      categories.forEach((c, i) => console.log(`  ${i + 1}. ${c.name} (id: ${c.id?.slice(0, 8)}...)`));
    }

    if (categories.length > 0) {
      const firstCatId = categories[0].id;
      const artRes = await fetch(
        `${API_BASE}/api/data/knowledge/articles/${firstCatId}${tenantId ? `?tenant_id=${tenantId}` : ''}`,
        { headers }
      );
      const artRaw = await artRes.json();
      const articles = Array.isArray(artRaw) ? artRaw : (artRaw?.data ?? []);
      if (!artRes.ok) {
        console.error('❌ 文章 API 失败:', artRes.status, artRaw);
        process.exit(1);
      }
      console.log('✓ 首个分类文章数:', articles.length);
      if (articles.length > 0) {
        articles.slice(0, 3).forEach((a, i) => console.log(`  ${i + 1}. ${a.title_zh || a.title}`));
      }
    }

    console.log('');
    console.log('=== 公司文档 API 测试通过 ===');
  } catch (err) {
    console.error('❌ 请求失败:', err.message);
    if (err.cause?.code === 'ECONNREFUSED') {
      console.error('   请先启动后端: cd server && npm run dev');
    }
    process.exit(1);
  }
}

main();
