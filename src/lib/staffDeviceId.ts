/**
 * 与 server/src/modules/adminDeviceWhitelist/deviceId.ts 保持完全一致（修改时请两边同步）。
 */
const DEVICE_ID_RE = /^[a-zA-Z0-9_\-:+./=@]{8,128}$/;

export function normalizeStaffDeviceId(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!DEVICE_ID_RE.test(s)) return null;
  return s;
}
