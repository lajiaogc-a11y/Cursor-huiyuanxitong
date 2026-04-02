/**
 * 登录 / RPC 等敏感入口限流（按 IP，依赖 trust proxy 时需在 app 上设置 trust proxy）
 *
 * 部署检查单：
 *   1. 生产环境设 TRUST_PROXY=1（app.ts 已处理）
 *   2. Nginx / CDN 正确透传 X-Forwarded-For（首个 hop 为真实客户端 IP）
 *   3. 若使用 Cloudflare，可额外读取 CF-Connecting-IP
 */
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const json429 = (message: string) => (_req: unknown, res: Response) => {
  res.status(429).json({ success: false, error: { code: 'RATE_LIMIT', message } });
};

/** 按 10% 概率抽样记录高风险接口的真实客户端 IP（用于排查限流问题） */
function sampleLogIp(req: Request, endpoint: string): void {
  if (Math.random() > 0.1) return;
  const forwarded = req.headers['x-forwarded-for'];
  const cfIp = req.headers['cf-connecting-ip'];
  console.info(JSON.stringify({
    audit: 'ip_sample', endpoint,
    reqIp: req.ip,
    xForwardedFor: typeof forwarded === 'string' ? forwarded.split(',')[0]?.trim() : undefined,
    cfConnectingIp: typeof cfIp === 'string' ? cfIp : undefined,
    ts: new Date().toISOString(),
  }));
}

/** 员工登录：防暴力破解 */
export const staffLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429('登录尝试过于频繁，请稍后再试'),
});

/** 员工注册 */
export const staffRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429('注册尝试过于频繁，请稍后再试'),
});

/** 会员登录 */
export const memberSignInLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429('登录尝试过于频繁，请稍后再试'),
});

/** 通用 RPC POST（含会员/员工已认证调用；公开白名单 RPC 同样计入） */
export const dataRpcPostLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429('接口请求过于频繁，请稍后再试'),
});

/**
 * 分享领抽奖次数 — 叠在 dataRpcPostLimiter 之上，防刷接口
 *（幂等仍靠 DB；限流减轻并发与滥用）
 */
export const memberGrantSpinShareLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429('分享领奖请求过于频繁，请稍后再试'),
});

/**
 * 抽奖提交 — 短时 burst（按会员 id，须在 requireMemberJwt 之后注册）
 * 与 lotteryDrawLimiter 叠加：防连点脚本在分钟窗口前先打满 DB
 */
export const lotteryDrawBurstLimiter = rateLimit({
  windowMs: 10 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    if (req.user?.type === 'member' && req.user?.id) return `draw_burst:${req.user.id}`;
    if (req.user?.id) return `draw_burst:${req.user.id}`;
    if (req.ip) return ipKeyGenerator(req.ip);
    return 'draw_burst:anonymous';
  },
  handler: json429('抽奖请求过于频繁，请稍候再试'),
});

/** 抽奖接口 — 按会员 ID 分钟级限流（已认证 + 会员 JWT 之后） */
export const lotteryDrawLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    if (req.user?.type === 'member' && req.user?.id) return `draw_min:${req.user.id}`;
    if (req.user?.id) return `draw_min:${req.user.id}`;
    if (req.ip) return ipKeyGenerator(req.ip);
    return 'anonymous';
  },
  handler: json429('抽奖请求过于频繁，请稍后再试'),
});

/** 邀请落地页注册（公开 RPC，防刷号） */
export const publicInviteSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429('当前网络注册尝试过于频繁，请稍后再试'),
});

/** 换取注册临时凭证（按 IP，略严于最终提交） */
export const memberRegisterInitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429('注册初始化请求过于频繁，请稍后再试'),
});

/**
 * 同一邀请码 + IP 维度限流（须在 body 解析且校验出 code 之后挂载）。
 * 缓解单 IP 对固定码暴力 init / 枚举。
 */
export const memberRegisterInitPerInviteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 24,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const code = typeof (req.body as { code?: string })?.code === 'string'
      ? (req.body as { code: string }).code.trim().toLowerCase()
      : '';
    const ip = req.ip ? ipKeyGenerator(req.ip) : 'unknown';
    const slug = code ? createHash('sha256').update(code, 'utf8').digest('hex').slice(0, 24) : 'empty';
    return `reg_init_inv:${slug}:${ip}`;
  },
  handler: json429('当前网络对该邀请码的尝试过于频繁，请稍后再试'),
});

/** 使用 registerToken 完成注册（与 RPC 提交同量级） */
export const memberRegisterCompleteLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  handler: json429('当前网络注册尝试过于频繁，请稍后再试'),
});

export { sampleLogIp };
