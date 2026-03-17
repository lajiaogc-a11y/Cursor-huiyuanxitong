/**
 * API 服务入口
 * 统一 API 结构：/api/auth, /api/members, /api/points, /api/giftcards, /api/orders, /api/whatsapp
 */
import 'dotenv/config';
import { config } from './config/index.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middlewares/index.js';
import authRoutes from './modules/auth/routes.js';
import membersRoutes from './modules/members/routes.js';
import pointsRoutes from './modules/points/routes.js';
import giftcardsRoutes from './modules/giftcards/routes.js';
import ordersRoutes from './modules/orders/routes.js';
import whatsappRoutes from './modules/whatsapp/routes.js';
import reportsRoutes from './modules/reports/routes.js';
import adminRoutes from './modules/admin/routes.js';
import tenantsRoutes from './modules/tenants/routes.js';
import memberPortalSettingsRoutes from './modules/memberPortalSettings/routes.js';
import phonePoolRoutes from './modules/phonePool/routes.js';
import dataRoutes from './modules/data/routes.js';
import employeesRoutes from './modules/employees/routes.js';
import knowledgeRoutes from './modules/knowledge/routes.js';
import logsRoutes from './modules/logs/routes.js';
import memberAuthRoutes from './modules/memberAuth/routes.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(morgan('combined'));
app.use(express.json());

// 统一 API 路由
app.use('/api/auth', authRoutes);
app.use('/api/members', membersRoutes);
app.use('/api/points', pointsRoutes);
app.use('/api/giftcards', giftcardsRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tenants', tenantsRoutes);
app.use('/api/member-portal-settings', memberPortalSettingsRoutes);
app.use('/api/phone-pool', phonePoolRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/employees', employeesRoutes);
app.use('/api/knowledge', knowledgeRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/member-auth', memberAuthRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/', (_req, res) => {
  res.type('html').send(`
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>API 服务</title></head>
<body style="font-family:sans-serif;padding:2rem;max-width:600px;margin:0 auto;">
  <h1>GC 礼品系统 API 服务</h1>
  <p>这是后端 API 服务，请访问前端页面使用系统：</p>
  <p><strong><a href="http://localhost:8080">http://localhost:8080</a></strong></p>
  <p style="color:#666;">本地开发时请同时运行前端：<code>npm run dev</code></p>
</body>
</html>
  `);
});

app.use(errorHandler);

if (!config.supabase.url || !config.supabase.serviceRoleKey) {
  console.warn('[API] 警告: SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY 未配置，登录将失败。请在 server/.env 中配置，详见 docs/LOCAL_SETUP.md');
} else {
  // 检测是否误用了 anon key：anon key 受 RLS 限制，会员/订单等会返回空
  try {
    const payload = JSON.parse(Buffer.from(config.supabase.serviceRoleKey.split('.')[1], 'base64url').toString());
    if (payload.role === 'anon') {
      console.warn('[API] 警告: SUPABASE_SERVICE_ROLE_KEY 当前是 anon key，会员/订单等会返回空。请从 Supabase 控制台 → Settings → API → service_role 复制真正的 service_role key 到 server/.env');
    }
  } catch (_) {}
}

app.listen(config.port, () => {
  console.log(`[API] Server running on http://localhost:${config.port}`);
  console.log(`[API] Routes: /api/auth, /api/members, /api/points, /api/giftcards, /api/orders, /api/whatsapp, /api/reports, /api/admin, /api/tenants, /api/member-portal-settings, /api/data`);
});
