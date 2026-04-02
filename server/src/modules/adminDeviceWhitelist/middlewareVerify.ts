import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { getAdminDeviceWhitelistConfigRepository, isEmployeeDeviceAllowedRepository } from './repository.js';

export type DeviceJwtGateResult =
  | { ok: true }
  | { ok: false; status: number; json: Record<string, unknown> };

/**
 * 员工 JWT 且平台已启用设备白名单且非平台超管：校验 token 内 device_id 仍在白名单
 */
export async function assertEmployeeDeviceJwtAllowed(
  req: AuthenticatedRequest,
  tokenDeviceId: string | undefined,
): Promise<DeviceJwtGateResult> {
  const u = req.user;
  if (!u || u.type !== 'employee') return { ok: true };
  if (u.is_platform_super_admin) return { ok: true };

  const cfg = await getAdminDeviceWhitelistConfigRepository();
  if (!cfg.enabled) return { ok: true };

  if (!tokenDeviceId || typeof tokenDeviceId !== 'string') {
    return {
      ok: false,
      status: 401,
      json: {
        success: false,
        error: {
          code: 'DEVICE_BINDING_REQUIRED',
          message: '登录令牌缺少设备绑定，请重新登录',
        },
      },
    };
  }

  let allowed: boolean;
  try {
    allowed = await isEmployeeDeviceAllowedRepository(u.id, tokenDeviceId);
  } catch (e) {
    console.error('[DeviceWhitelist] isEmployeeDeviceAllowedRepository:', (e as Error).message);
    return {
      ok: false,
      status: 503,
      json: {
        success: false,
        error: {
          code: 'DEVICE_WHITELIST_UNAVAILABLE',
          message: '设备白名单数据暂不可用，请稍后重试或联系管理员',
        },
      },
    };
  }
  if (!allowed) {
    return {
      ok: false,
      status: 401,
      json: {
        success: false,
        error: {
          code: 'DEVICE_NOT_ALLOWED',
          message: '当前设备已从白名单移除或已失效，请重新登录',
        },
      },
    };
  }

  return { ok: true };
}
