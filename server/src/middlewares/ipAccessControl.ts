/**
 * IP 访问控制中间件 - 根据 data_settings 中 ip_access_control 配置执行拦截
 */
import type { Request, Response, NextFunction } from 'express';
import { queryOne } from '../database/index.js';
import { ipMatchesCidr, isPrivateLanIp as isPrivateIp } from '../lib/ipMatch.js';

interface IpRule { ip: string; label?: string; }
interface IpAccessConfig {
  enabled: boolean;
  mode: 'whitelist' | 'blacklist';
  rules: IpRule[];
  enforce_private_lan: boolean;
}

let cachedConfig: IpAccessConfig | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000;

async function loadConfig(): Promise<IpAccessConfig> {
  const now = Date.now();
  if (cachedConfig && now < cacheExpiry) return cachedConfig;

  try {
    const row = await queryOne<{ setting_value: unknown }>(
      `SELECT setting_value FROM data_settings WHERE setting_key = 'ip_access_control' LIMIT 1`,
    );
    if (!row) {
      cachedConfig = { enabled: false, mode: 'whitelist', rules: [], enforce_private_lan: false };
    } else {
      const val = typeof row.setting_value === 'string' ? JSON.parse(row.setting_value) : row.setting_value;
      cachedConfig = {
        enabled: !!val?.enabled,
        mode: val?.mode === 'blacklist' ? 'blacklist' : 'whitelist',
        rules: Array.isArray(val?.rules) ? val.rules : [],
        enforce_private_lan: typeof val?.enforce_private_lan === 'boolean' ? val.enforce_private_lan : false,
      };
    }
  } catch {
    cachedConfig = { enabled: false, mode: 'whitelist', rules: [], enforce_private_lan: false };
  }

  cacheExpiry = now + CACHE_TTL_MS;
  return cachedConfig;
}

function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  const ip = (typeof xff === 'string' ? xff.split(',')[0].trim() : req.ip) || '127.0.0.1';
  return ip.replace(/^::ffff:/, '');
}

export function ipAccessControlMiddleware(req: Request, res: Response, next: NextFunction): void {
  loadConfig().then((config) => {
    if (!config.enabled || config.rules.length === 0) {
      next();
      return;
    }

    const clientIp = getClientIp(req);

    if (
      !config.enforce_private_lan &&
      (isPrivateIp(clientIp) || clientIp === '127.0.0.1' || clientIp === '::1')
    ) {
      next();
      return;
    }

    const ruleIps = config.rules.map(r => r.ip);
    const matched = ruleIps.some(cidr => ipMatchesCidr(clientIp, cidr));

    if (config.mode === 'whitelist') {
      if (matched) {
        next();
      } else {
        res.status(403).json({
          error: 'IP_ACCESS_DENIED',
          message: 'Access denied: your IP is not in the allowlist',
        });
      }
    } else {
      if (matched) {
        res.status(403).json({
          error: 'IP_ACCESS_DENIED',
          message: 'Access denied: your IP has been blocked',
        });
      } else {
        next();
      }
    }
  }).catch(() => {
    next();
  });
}
