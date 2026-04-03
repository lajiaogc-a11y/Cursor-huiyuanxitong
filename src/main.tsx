import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import ErrorBoundary from "./components/ErrorBoundary";
import "nprogress/nprogress.css";
import "./index.css";

import { initWebVitals } from "./services/webVitalsService";
import { initApiClient } from "./api/init";
import { installSafeToFixed } from "./lib/safeNumber";

installSafeToFixed();
initApiClient();

// Suppress debug/info logs in production to reduce noise and avoid leaking internals.
// console.error is intentionally kept active for monitoring and error tracking.
if (import.meta.env.PROD) {
  const noop = () => {};
  console.log   = noop;
  console.warn  = noop;
  console.debug = noop;
  console.info  = noop;
}

window.addEventListener('unhandledrejection', (event) => {
  const msg = String(event.reason?.message || event.reason || '');
  const isChunk =
    (event.reason?.name === 'ChunkLoadError') ||
    msg.includes('Loading chunk') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed');
  if (isChunk) {
    const key = '__global_chunk_reload_count__';
    const n = Number(sessionStorage.getItem(key) || '0');
    if (n < 2) {
      sessionStorage.setItem(key, String(n + 1));
      window.location.reload();
    }
  }
});

async function cleanupLegacyServiceWorker() {
  if (!import.meta.env.PROD) return;
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if ((import.meta.env.VITE_BUILD_TARGET || "web") !== "web") return;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));

    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch {
    // 忽略清理失败，避免影响应用启动
  }
}

void (async () => {
  await cleanupLegacyServiceWorker();
  createRoot(document.getElementById("root")!).render(
    <ErrorBoundary>
      <App />
    </ErrorBoundary>,
  );
})();

// Initialize Web Vitals collection (production only)
initWebVitals();
