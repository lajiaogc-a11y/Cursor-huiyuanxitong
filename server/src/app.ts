/**
 * API 服务入口
 * 统一 API 结构：/api/auth, /api/members, /api/points, /api/giftcards, /api/orders, /api/whatsapp
 */
import 'dotenv/config';
/** 与业务默认一致：北京时间（日志、Date 在部分环境下的表现）；可用 TZ / APP_TIMEZONE 覆盖 */
if (!process.env.TZ?.trim()) {
  process.env.TZ = (process.env.APP_TIMEZONE || 'Asia/Shanghai').trim();
}
import { config } from './config/index.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { errorHandler } from './middlewares/index.js';
import { wrapRouterAsync } from './middlewares/wrapAsync.js';
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
import memberAnalyticsRoutes from './modules/memberAnalytics/routes.js';
import phonePoolRoutes from './modules/phonePool/routes.js';
import dataRoutes from './modules/data/routes.js';
import publicDataSettingsRoutes from './modules/data/publicSettingsRouter.js';
import employeesRoutes from './modules/employees/routes.js';
import knowledgeRoutes from './modules/knowledge/routes.js';
import logsRoutes from './modules/logs/routes.js';
import memberAuthRoutes from './modules/memberAuth/routes.js';
import memberRegisterRoutes from './modules/memberRegister/routes.js';
import tenantQuotaRoutes from './modules/tenantQuota/routes.js';
import financeLedgerRoutes from './modules/finance/routes.js';
import lotteryRoutes from './modules/lottery/routes.js';
import uploadRoutes from './modules/upload/routes.js';
import databaseDumpRoutes from './modules/databaseDump/routes.js';
import internalBackupRoutes from './modules/backup/internalRoutes.js';
import webhookRoutes from './modules/webhooks/routes.js';
import taskPostersRoutes from './modules/taskPosters/routes.js';
import tasksRoutes from './modules/tasks/routes.js';
import riskRoutes from './modules/risk/routes.js';
import adminDeviceWhitelistRoutes from './modules/adminDeviceWhitelist/routes.js';
import { startAutoBackupScheduler, stopAutoBackupScheduler } from './modules/backup/autoScheduler.js';
import { startMemberDataCleanupScheduler, stopMemberDataCleanupScheduler } from './modules/memberAnalytics/cleanupScheduler.js';
import {
  startActivityDataRetentionScheduler,
  stopActivityDataRetentionScheduler,
} from './modules/data/activityDataRetentionScheduler.js';
import inviteMemberRoutes from './modules/inviteLeaderboard/memberRoutes.js';
import memberInboxRoutes from './modules/memberInboxNotifications/routes.js';
import memberLevelsRoutes from './modules/memberLevels/routes.js';
import {
  startInviteLeaderboardGrowthScheduler,
  stopInviteLeaderboardGrowthScheduler,
} from './modules/inviteLeaderboard/fakeGrowthJob.js';
import {
  startSpinFakeLotteryScheduler,
  stopSpinFakeLotteryScheduler,
} from './modules/lottery/spinFakeSimulationJob.js';
import {
  startInviteRegisterTokenCleanupScheduler,
  stopInviteRegisterTokenCleanupScheduler,
} from './modules/memberRegister/expiredTokenCleanup.js';

const app = express();

// 位于反向代理 / CDN 后时按 IP 限流才准确：生产环境设置 TRUST_PROXY=1
const isProduction = config.nodeEnv === 'production';
const trustProxyEnvOn = process.env.TRUST_PROXY === '1';
/** 开发联调：不改 NODE_ENV 也可验证 trust proxy 日志与行为（勿用于生产） */
const verifyTrustProxyDev =
  !isProduction && process.env.VERIFY_TRUST_PROXY === '1' && trustProxyEnvOn;

if ((isProduction && trustProxyEnvOn) || verifyTrustProxyDev) {
  app.set('trust proxy', 1);
  if (verifyTrustProxyDev) {
    console.log(
      '[API] trust proxy enabled (VERIFY_TRUST_PROXY=1 + TRUST_PROXY=1, dev mode); set NODE_ENV=production + TRUST_PROXY=1 and restart for production',
    );
  } else {
    console.log('[API] trust proxy enabled (TRUST_PROXY=1) — rate limit / req.ip use X-Forwarded-For');
  }
} else if (isProduction && !trustProxyEnvOn) {
  console.warn(
    '[API] TRUST_PROXY=1 not set in production: rate limiting will use proxy IP when behind CDN/reverse proxy; set TRUST_PROXY=1 and restart',
  );
}

// CORS: 严格白名单。生产建议设置 CORS_ALLOWED_ORIGINS；未设置时用 MEMBER_HOSTS/STAFF_HOSTS 推导的 sitePublicOrigins（见 config）。
const isDev = config.nodeEnv === 'development';
const corsAllowedSet = new Set([
  ...config.cors.allowedOrigins,
  ...(config.cors.allowedOrigins.length === 0 ? config.sitePublicOrigins : []),
  ...(isDev
    ? [
        'http://localhost:8080',
        'http://localhost:8081',
        'http://localhost:5173',
        'http://127.0.0.1:8080',
        'http://127.0.0.1:8081',
        'http://127.0.0.1:5173',
      ]
    : []),
]);

app.use(cors({
  origin(origin, callback) {
    // Allow requests with no Origin header (server-to-server, mobile apps, curl)
    if (!origin) return callback(null, true);
    if (corsAllowedSet.has(origin)) return callback(null, true);
    callback(null, false);
  },
  credentials: true,
}));
/**
 * CSP：off | report | enforce
 * - 生产默认 enforce（本服务直接返回的 HTML/JSON 带 CSP；主 SPA 若由 CDN/Nginx 托管需在其侧单独配置）
 * - 预发/排障可设 CSP_MODE=report；本地开发默认 off
 */
const cspModeRaw = (process.env.CSP_MODE || '').trim().toLowerCase();
const cspMode: 'off' | 'report' | 'enforce' =
  cspModeRaw === 'off' || cspModeRaw === 'report' || cspModeRaw === 'enforce'
    ? (cspModeRaw as 'off' | 'report' | 'enforce')
    : isProduction
      ? 'enforce'
      : 'off';
const cspDirectives = {
  defaultSrc: ["'self'"],
  // 注意：'unsafe-inline' 和 'unsafe-eval' 是 React/Vite SPA 的临时需求
  // 上线后建议通过 nonce 方式逐步收紧
  scriptSrc: ["'self'"],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
  imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
  connectSrc: ["'self'", ...config.sitePublicOrigins],
  frameSrc: ["'none'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  ...(cspMode === 'report' || cspMode === 'enforce'
    ? { reportUri: '/api/csp-report' }
    : {}),
};
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: false,
  contentSecurityPolicy: cspMode === 'enforce'
    ? { directives: cspDirectives }
    : cspMode === 'report'
      ? { directives: cspDirectives, reportOnly: true }
      : false,
}));
app.use(morgan(isProduction ? 'short' : 'dev'));
app.use(express.json({ limit: '10mb' }));

// CSP 违规报告接收端点
app.post('/api/csp-report', express.json({ type: ['application/json', 'application/csp-report'] }), (req, _res) => {
  const body = req.body?.['csp-report'] || req.body;
  if (body) {
    console.warn('[CSP-Violation]', JSON.stringify({
      documentUri: body['document-uri'],
      violatedDirective: body['violated-directive'],
      blockedUri: body['blocked-uri'],
      sourceFile: body['source-file'],
      lineNumber: body['line-number'],
      ts: new Date().toISOString(),
    }));
  }
  _res.status(204).end();
});

// IP 访问控制中间件（在所有 API 路由之前执行）
import { ipAccessControlMiddleware } from './middlewares/ipAccessControl.js';
app.use('/api', ipAccessControlMiddleware);

/**
 * 动态 API 默认禁止 HTTP 缓存，避免浏览器或反向代理把带鉴权的 JSON 当作可复用响应缓存，
 * 导致「操作后刷新 / 多设备」看到旧数据。个别路由可再 set Header 覆盖（如上传 immutable 静态资源）。
 */
app.use('/api', (_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  next();
});

// 统一 API 路由（wrapRouterAsync 自动为所有 async handler 添加错误捕获）
app.use('/api/auth', wrapRouterAsync(authRoutes));
app.use('/api/members', wrapRouterAsync(membersRoutes));
app.use('/api/member-levels', wrapRouterAsync(memberLevelsRoutes));
app.use('/api/points', wrapRouterAsync(pointsRoutes));
app.use('/api/giftcards', wrapRouterAsync(giftcardsRoutes));
app.use('/api/orders', wrapRouterAsync(ordersRoutes));
app.use('/api/whatsapp', wrapRouterAsync(whatsappRoutes));
app.use('/api/reports', wrapRouterAsync(reportsRoutes));
app.use('/api/admin', wrapRouterAsync(adminRoutes));
app.use('/api/admin/database', wrapRouterAsync(databaseDumpRoutes));
app.use('/api/tenants', wrapRouterAsync(tenantsRoutes));
app.use('/api/member-portal-settings', wrapRouterAsync(memberPortalSettingsRoutes));
app.use('/api/member-portal/site-data', wrapRouterAsync(memberAnalyticsRoutes));
app.use('/api/member-portal/analytics', wrapRouterAsync(memberAnalyticsRoutes));
app.use('/api/phone-pool', wrapRouterAsync(phonePoolRoutes));
/** 登录前可读：须先于 /api/data 主路由，避免 data 子路由栈中 authMiddleware 误伤 */
app.use('/api/data/settings', wrapRouterAsync(publicDataSettingsRoutes));
app.use('/api/data', wrapRouterAsync(dataRoutes));
app.use('/api/employees', wrapRouterAsync(employeesRoutes));
app.use('/api/knowledge', wrapRouterAsync(knowledgeRoutes));
app.use('/api/logs', wrapRouterAsync(logsRoutes));
app.use('/api/member-auth', wrapRouterAsync(memberAuthRoutes));
/** 会员邀请排行榜 top5（会员 JWT） */
app.use('/api/invite', wrapRouterAsync(inviteMemberRoutes));
app.use('/api/member-inbox', wrapRouterAsync(memberInboxRoutes));
/** 邀请注册：register-init + register（公开，限流） */
app.use('/api/member', wrapRouterAsync(memberRegisterRoutes));
app.use('/api/tenant/quota', wrapRouterAsync(tenantQuotaRoutes));
app.use('/api/finance/ledger', wrapRouterAsync(financeLedgerRoutes));
app.use('/api/lottery', wrapRouterAsync(lotteryRoutes));
app.use('/api/upload', wrapRouterAsync(uploadRoutes));
app.use('/api/internal', wrapRouterAsync(internalBackupRoutes));
app.use('/api/webhooks', wrapRouterAsync(webhookRoutes));
app.use('/api/task-posters', wrapRouterAsync(taskPostersRoutes));
app.use('/api/tasks', wrapRouterAsync(tasksRoutes));
app.use('/api/risk', wrapRouterAsync(riskRoutes));
app.use('/api/platform/device-whitelist', wrapRouterAsync(adminDeviceWhitelistRoutes));

/** 前端 webVitalsService 生产环境上报；无持久化，仅消除 404 与控制台噪音 */
app.post('/api/web-vitals', (_req, res) => {
  res.status(204).end();
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

function escapeHtmlAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function hostsToPortalOrigins(hosts: readonly string[]): string[] {
  return hosts.map((h) => {
    const x = h.trim();
    if (!x) return '';
    if (/^https?:\/\//i.test(x)) return x.replace(/\/$/, '');
    return `https://${x.replace(/\/$/, '')}`;
  }).filter(Boolean);
}

function buildApiRootInfoHtml(): string {
  const isProd = config.nodeEnv === 'production';
  const memberOrigins = hostsToPortalOrigins(config.memberPortalHosts);
  const staffOrigins = hostsToPortalOrigins(config.staffPortalHosts);
  const listItems: string[] = [];
  for (const o of memberOrigins) {
    const e = escapeHtmlAttr(o);
    listItems.push(`<li>Member portal: <a href="${e}">${e}</a></li>`);
  }
  for (const o of staffOrigins) {
    const e = escapeHtmlAttr(o);
    listItems.push(`<li>Staff portal: <a href="${e}">${e}</a></li>`);
  }
  const portalList = listItems.length
    ? `<ul style="padding-left:1.25rem;">${listItems.join('')}</ul>`
    : '<p>No public portal URLs configured. Set domains in <code>MEMBER_HOSTS</code> and <code>STAFF_HOSTS</code>.</p>';

  const devBlock = isProd
    ? ''
    : `
  <p style="margin-top:1.25rem;"><strong>Local dev (example URLs)</strong></p>
  <ul style="padding-left:1.25rem;">
    <li>Member: <a href="http://localhost:8081">http://localhost:8081</a></li>
    <li>Staff: <a href="http://localhost:8080">http://localhost:8080</a></li>
  </ul>
  <p style="color:#666;font-size:0.95rem;">Ports follow your local frontend setup; start the dev servers from the repo root per project docs.</p>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gift System · API Service</title>
</head>
<body style="font-family:system-ui,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;padding:2rem;max-width:640px;margin:0 auto;line-height:1.6;">
  <h1 style="font-size:1.35rem;">Gift System · API Service</h1>
  <p>This is the <strong>backend API</strong> (not the admin UI). Open one of the portal URLs below in your browser:</p>
  ${isProd ? portalList : `${portalList}${devBlock}`}
</body>
</html>`;
}

app.get('/', (_req, res) => {
  res.type('html').send(buildApiRootInfoHtml());
});

app.use(errorHandler);

if (
  !config.mysqlUsesDatabaseUrl &&
  !config.mysql.password &&
  config.mysql.host === 'localhost'
) {
  console.warn('[API] WARNING: MYSQL_PASSWORD not set. Please configure it in server/.env');
}

import { runAllMigrations } from './startup/runAllMigrations.js';

/**
 * 方案 A：生产默认不在应用内跑迁移（多实例重复、失败半可用）；部署前执行 `npm run migrate:all`。
 * - RUN_DB_MIGRATIONS_ON_START=1 强制启动时迁移（失败则退出进程）
 * - RUN_DB_MIGRATIONS_ON_START=0 强制跳过
 * - 未设置时：development 执行迁移，production 跳过
 */
function shouldRunMigrationsOnStart(): boolean {
  const v = (process.env.RUN_DB_MIGRATIONS_ON_START || '').trim();
  if (v === '1') return true;
  if (v === '0') return false;
  return config.nodeEnv !== 'production';
}

let server: ReturnType<typeof app.listen> | undefined;

void (async () => {
  if (shouldRunMigrationsOnStart()) {
    try {
      await runAllMigrations();
      console.log('[API] DB migrations completed (startup)');
    } catch (e) {
      console.error('[API] DB migrations failed — refusing to start:', e);
      process.exit(1);
    }
  } else {
    console.log(
      '[API] Skipping DB migrations on start (production default). Before first deploy or schema change, run: cd server && npm run migrate:all',
    );
  }

  server = app.listen(config.port, () => {
    console.log(`[API] Server running on http://localhost:${config.port}`);
    console.log(`[API] CSP_MODE=${cspMode} (set CSP_MODE=report|enforce|off to override)`);
    if (config.s3.enabled) {
      console.log(`[API] S3 image upload: enabled (bucket=${config.s3.bucket}, region=${config.s3.region})`);
    }
    console.log(
      `[API] Database: MySQL ${config.mysqlUsesDatabaseUrl ? 'DATABASE_URL → ' : ''}${config.mysql.host}:${config.mysql.port}/${config.mysql.database}`,
    );
    if (process.env.SKIP_STARTUP_SCHEDULERS === '1') {
      console.warn('[API] SKIP_STARTUP_SCHEDULERS=1: background schedulers not started (use when DB is unavailable or for UI-only dev)');
    } else {
      startAutoBackupScheduler();
      startMemberDataCleanupScheduler();
      startActivityDataRetentionScheduler();
      startInviteRegisterTokenCleanupScheduler();
      startSpinFakeLotteryScheduler();
      /** 邀请排行榜假用户增长：每 2 分钟检查一次，每租户实际间隔见 growth_segment_hours（默认 72h） */
      startInviteLeaderboardGrowthScheduler();
    }
  });
})();

async function gracefulShutdown(signal: string) {
  console.log(`[API] Received ${signal}, shutting down...`);
  stopAutoBackupScheduler();
  stopMemberDataCleanupScheduler();
  stopActivityDataRetentionScheduler();
  stopInviteLeaderboardGrowthScheduler();
  stopInviteRegisterTokenCleanupScheduler();
  stopSpinFakeLotteryScheduler();
  try {
    server?.close(() => console.log('[API] HTTP server closed'));
    const { closePool } = await import('./database/index.js');
    await closePool();
    console.log('[API] MySQL pool closed');
  } catch (e) {
    console.error('[API] Shutdown error:', e);
  }
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
