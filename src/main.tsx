import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "nprogress/nprogress.css";
import "./index.css";
import { initWebVitals } from "./services/webVitalsService";

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

void cleanupLegacyServiceWorker();
createRoot(document.getElementById("root")!).render(<App />);

// Initialize Web Vitals collection (production only)
initWebVitals();
