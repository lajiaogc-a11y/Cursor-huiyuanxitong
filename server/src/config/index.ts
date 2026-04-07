/**
 * 配置管理 - 统一读取环境变量
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** MySQL2 / SESSION：仅允许 ±HH:MM，防止注入；默认北京时间 */
function normalizeMysqlTimezone(raw: string | undefined): string {
  const t = (raw ?? '+08:00').trim();
  return /^[+-]\d{2}:\d{2}$/.test(t) ? t : '+08:00';
}
const mysqlTimezone = normalizeMysqlTimezone(process.env.MYSQL_TIMEZONE);

/**
 * 仅当 DATABASE_URL 为 mysql / mysql2 协议时用于 API 连库（避免与根目录脚本里的 postgresql:// 混淆）。
 */
function tryParseMysqlDatabaseUrl(raw: string): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
} | null {
  const t = raw.trim();
  if (!t.startsWith('mysql://') && !t.startsWith('mysql2://')) {
    return null;
  }
  try {
    const normalizedProto = t.replace(/^mysql2:/, 'mysql:');
    const u = new URL(normalizedProto);
    if (u.protocol !== 'mysql:') return null;
    const host = u.hostname;
    if (!host) return null;
    const port = u.port ? parseInt(u.port, 10) : 3306;
    const pathDb = (u.pathname || '/').replace(/^\//, '').split('/')[0] || '';
    const database = pathDb ? decodeURIComponent(pathDb) : '';
    const user = decodeURIComponent(u.username || '');
    const password = decodeURIComponent(u.password || '');
    return { host, port, user, password, database };
  } catch {
    return null;
  }
}

/** mysql2 池使用 uri 时建议 mysql:// 前缀 */
function mysqlUriForPool(raw: string): string {
  const t = raw.trim();
  return t.startsWith('mysql2://') ? `mysql://${t.slice('mysql2://'.length)}` : t;
}

const databaseUrlRaw = (process.env.DATABASE_URL || '').trim();
const parsedMysqlUrl = databaseUrlRaw ? tryParseMysqlDatabaseUrl(databaseUrlRaw) : null;
const mysqlConnectionUri = parsedMysqlUrl ? mysqlUriForPool(databaseUrlRaw) : null;

const mysqlFromEnvVars = {
  host: process.env.MYSQL_HOST ?? 'localhost',
  port: parseInt(process.env.MYSQL_PORT ?? '3306', 10),
  user: process.env.MYSQL_USER ?? 'root',
  password: process.env.MYSQL_PASSWORD ?? '',
  database: process.env.MYSQL_DATABASE ?? 'gc_member_system',
};

/** 逗号分隔主机名，用于 CORS 兜底与文档；与前端 VITE_MEMBER_HOSTS / VITE_STAFF_HOSTS 应对齐 */
function parseHostList(raw: string | undefined, fallbacks: readonly string[]): string[] {
  const t = (raw ?? '').trim();
  if (!t) return [...fallbacks];
  return t.split(',').map((s) => s.trim()).filter(Boolean);
}

function hostsToOrigins(hosts: string[]): string[] {
  return hosts.map((h) => {
    const x = h.trim();
    if (/^https?:\/\//i.test(x)) return x.replace(/\/$/, '');
    return `https://${x.replace(/\/$/, '')}`;
  });
}

const memberPortalHosts = parseHostList(process.env.MEMBER_HOSTS, ['crm.fastgc.cc']);
const staffPortalHosts = parseHostList(process.env.STAFF_HOSTS, ['admin.crm.fastgc.cc']);

/** 未配置 CORS_ALLOWED_ORIGINS 时允许的默认来源（https 站点） */
const sitePublicOrigins = [
  ...hostsToOrigins(memberPortalHosts),
  ...hostsToOrigins(staffPortalHosts),
];

const mysqlCore = parsedMysqlUrl
  ? {
      host: parsedMysqlUrl.host,
      port: parsedMysqlUrl.port,
      user: parsedMysqlUrl.user,
      password: parsedMysqlUrl.password,
      database:
        parsedMysqlUrl.database ||
        process.env.MYSQL_DATABASE ||
        mysqlFromEnvVars.database,
    }
  : mysqlFromEnvVars;

/**
 * 平台租户 ID：通过 PLATFORM_TENANT_ID 环境变量配置。
 * 不同环境可使用不同值，不再需要改源码。
 * 缺省值保留兼容旧部署（FastGC 平台租户）。
 */
const platformTenantId = (process.env.PLATFORM_TENANT_ID || '05307a8c-68f5-4fe4-a212-06439387dbd1').trim();

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProductionEnv = nodeEnv === 'production';

/**
 * 会员 JWT 必须与员工 JWT_SECRET 隔离。生产环境强制 MEMBER_JWT_SECRET；
 * 禁止 JWT_SECRET + '_member' 等可预测派生。
 */
function resolveMemberJwtSecret(): string {
  const explicit = process.env.MEMBER_JWT_SECRET?.trim();
  if (isProductionEnv) {
    if (!explicit) {
      throw new Error(
        '[config] FATAL: NODE_ENV=production requires MEMBER_JWT_SECRET. ' +
          'Set a strong random value independent of JWT_SECRET. Member and staff tokens must not be key-linked.',
      );
    }
    return explicit;
  }
  if (explicit) return explicit;
  const devOnly = process.env.DEV_MEMBER_JWT_SECRET?.trim();
  if (devOnly) return devOnly;
  console.warn(
    '[config] MEMBER_JWT_SECRET unset (non-production): using built-in dev placeholder. ' +
      'Set MEMBER_JWT_SECRET or DEV_MEMBER_JWT_SECRET for stable tokens across restarts.',
  );
  return '__dev_only_member_jwt_placeholder_min_32_chars__';
}

const memberJwtSecret = resolveMemberJwtSecret();

function clampInt(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

const s3Bucket = (process.env.S3_BUCKET || '').trim();
const s3Region = (process.env.AWS_REGION || process.env.S3_REGION || '').trim();
const s3Enabled = Boolean(s3Bucket && s3Region);

export const config = {
  port: parseInt(process.env.PORT ?? '3001', 10),
  nodeEnv,
  platformTenantId,
  /** Node 进程默认时区（日志、new Date() 展示等）；可覆盖为其他 IANA 名 */
  appTimezone: process.env.APP_TIMEZONE ?? 'Asia/Shanghai',
  /** 非空时 database/index 用 uri 建池（已规范为 mysql://，保留查询串如 SSL） */
  mysqlConnectionUri,
  /** 是否由 DATABASE_URL（MySQL）解析而来，用于日志与告警 */
  mysqlUsesDatabaseUrl: mysqlConnectionUri != null,
  mysql: {
    ...mysqlCore,
    /** 与库内 DATETIME（北京时间）一致，避免 JSON 序列化后前端再解析快/慢 8 小时 */
    timezone: mysqlTimezone,
  },
  jwt: {
    get secret(): string {
      return requireEnv('JWT_SECRET');
    },
    /** 独立会员 JWT 密钥（生产必须 MEMBER_JWT_SECRET） */
    memberSecret: memberJwtSecret,
  },
  cors: {
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
  },
  /** 方案 D：与 MEMBER_HOSTS / STAFF_HOSTS 对齐的公网 Origin 列表 */
  sitePublicOrigins,
  memberPortalHosts,
  staffPortalHosts,
  /** 定时备份：HTTP 密钥与可选进程内间隔 */
  backup: {
    cronSecret: (process.env.BACKUP_CRON_SECRET || '').trim(),
    /** >0 时在本进程 setInterval 触发自动备份（毫秒）；多实例部署建议只用外部队列/cron 调 HTTP，避免重复 */
    autoIntervalMs: Math.max(0, parseInt(process.env.BACKUP_AUTO_INTERVAL_MS || '0', 10) || 0),
  },
  webhook: {
    /** POST /api/internal/webhooks/process-queue */
    processorSecret: (process.env.WEBHOOK_PROCESSOR_SECRET || '').trim(),
  },
  upload: {
    /**
     * 兼容旧部署：与 `visibility` 列配合。私有图（visibility=private）始终需鉴权；
     * 此开关主要影响「仅 MySQL、无 visibility」的旧逻辑路径。
     *   'public' — 匿名可读标记为 public 的资源
     *   'required' — 额外收紧（租户级仍可对 public 匿名，便于会员端 &lt;img&gt;）
     */
    imageAuth: (process.env.UPLOAD_IMAGE_AUTH || 'public').trim().toLowerCase() as 'public' | 'required',
    /** POST 与 GET 现场转码共用：WebP 质量 1–100 */
    webpQuality: clampInt(parseInt(process.env.UPLOAD_WEBP_QUALITY || '82', 10), 1, 100, 82),
    webpQualityFallback: clampInt(parseInt(process.env.UPLOAD_WEBP_QUALITY_FALLBACK || '68', 10), 1, 100, 68),
    /** 解码后原始图最大字节（base64 解码后校验） */
    maxInputBytes: Math.max(
      1024,
      parseInt(process.env.UPLOAD_WEBP_MAX_INPUT_BYTES || String(15 * 1024 * 1024), 10) || 15 * 1024 * 1024,
    ),
    /** 入库 / 输出 WebP 最大字节 */
    maxOutputBytes: Math.max(
      1024,
      parseInt(process.env.UPLOAD_WEBP_MAX_OUTPUT_BYTES || String(2 * 1024 * 1024), 10) || 2 * 1024 * 1024,
    ),
    /** 长边上限（像素） */
    maxPixelSide: clampInt(parseInt(process.env.UPLOAD_WEBP_MAX_PIXEL_SIDE || '4096', 10), 256, 16384, 4096),
    /**
     * GET /api/upload/image/:id：默认将历史非 WebP（或魔数不符）转 WebP 再输出，与 POST 入库策略一致。
     * 仅当 UPLOAD_NORMALIZE_TO_WEBP_ON_READ=0 时关闭（排障/兼容极老客户端）。
     */
    normalizeToWebpOnRead: process.env.UPLOAD_NORMALIZE_TO_WEBP_ON_READ !== '0',
  },
  /**
   * S3：配置 S3_BUCKET + AWS_REGION（或 S3_REGION）后，新上传写入 S3；桶保持私有，经 API 或 presign 访问。
   * 凭证使用默认链：AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY 或实例角色。
   */
  s3: {
    enabled: s3Enabled,
    bucket: s3Bucket,
    region: s3Region,
    /** 可选：CloudFront 等（仅文档/将来扩展；当前读图走 API 或 presign，不依赖公开桶 URL） */
    publicBaseUrl: (process.env.S3_PUBLIC_BASE_URL || '').trim().replace(/\/$/, ''),
    presignExpiresSec: Math.min(
      3600,
      Math.max(60, parseInt(process.env.S3_PRESIGN_EXPIRES_SEC || '300', 10) || 300),
    ),
  },
  /** 邀请/推广扫码注册：一次性 registerToken 有效期（秒），范围 120–600 */
  inviteRegisterTokenTtlSec: Math.min(
    600,
    Math.max(120, parseInt(process.env.INVITE_REGISTER_TOKEN_TTL_SEC || '300', 10) || 300),
  ),
};
