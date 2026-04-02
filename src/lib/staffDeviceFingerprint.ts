import FingerprintJS from '@fingerprintjs/fingerprintjs';
import { normalizeStaffDeviceId } from '@/lib/staffDeviceId';

let loadPromise: Promise<import('@fingerprintjs/fingerprintjs').Agent> | null = null;

function getLoadPromise() {
  if (!loadPromise) loadPromise = FingerprintJS.load();
  return loadPromise;
}

/** FingerprintJS visitorId，经与后端一致的 normalize 后供登录/绑定提交 */
export async function getStaffDeviceVisitorId(): Promise<string | null> {
  try {
    const fp = await getLoadPromise();
    const result = await fp.get();
    return normalizeStaffDeviceId(result.visitorId);
  } catch {
    return null;
  }
}
