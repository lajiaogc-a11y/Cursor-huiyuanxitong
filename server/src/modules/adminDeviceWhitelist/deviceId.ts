/**
 * 员工端 device_id 校验（登录绑定、平台代录）。
 * 兼容 FingerprintJS visitorId 及常见第三方指纹（Base64 的 =、路径类 / . 等）。
 * 长度上限与 employee_devices.device_id VARCHAR(128)、auth 路由 Zod max(128) 一致。
 * 如需调整，须同步：本正则、server/src/modules/auth/routes.ts、DB 列长、前端 src/lib/staffDeviceId.ts。
 */
const DEVICE_ID_RE = /^[a-zA-Z0-9_\-:+./=@]{8,128}$/;

export function normalizeStaffDeviceId(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!DEVICE_ID_RE.test(s)) return null;
  return s;
}
