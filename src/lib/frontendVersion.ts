/** 与 public/version.json、UpdatePrompt 一致 */
export const DEV_BUILD_PLACEHOLDER = "dev-build";

/** 拉取线上 version.json 的 buildTime；undefined 表示网络或 HTTP 失败 */
export async function fetchRemoteFrontendBuildTime(): Promise<string | undefined> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { buildTime?: string };
    return String(data.buildTime || "").trim();
  } catch {
    return undefined;
  }
}

/** 与 UpdatePrompt 中非 PWA 路径一致：注销 SW、清缓存后带参硬刷新 */
export async function hardReloadWebFrontend(): Promise<void> {
  try {
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // ignore
  }
  const url = new URL(window.location.href);
  url.searchParams.set("__v", Date.now().toString());
  window.location.replace(url.toString());
}
