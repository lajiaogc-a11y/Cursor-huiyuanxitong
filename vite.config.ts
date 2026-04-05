import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { VitePWA } from "vite-plugin-pwa";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const appPackage = JSON.parse(readFileSync(path.join(appRoot, "package.json"), "utf-8")) as { version: string };

// https://vitejs.dev/config/
// VITE_BUILD_TARGET: web(默认) | electron | capacitor
export default defineConfig(({ mode }) => {
  const buildTarget = process.env.VITE_BUILD_TARGET || 'web';
  const useRelativeBase = buildTarget === 'electron' || buildTarget === 'capacitor';
  const enablePwa = buildTarget !== "web";
  const buildTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
  /** Vite 5+ 会给 stylesheet link 加 crossorigin；在部分 CDN/代理上若缺 CORS 头会导致整站 CSS 不生效（仅余 index.html 内联样式） */
  const stripStylesheetCrossoriginPlugin = {
    name: "strip-stylesheet-crossorigin",
    enforce: "post" as const,
    transformIndexHtml(html: string) {
      return html.replace(
        /<link\s+rel="stylesheet"\s+crossorigin(?:=["'][^"']*["'])?\s+/g,
        '<link rel="stylesheet" ',
      );
    },
  };

  const emitVersionPlugin = {
    name: "emit-version-json",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "version.json",
        source: JSON.stringify(
          {
            buildTime,
            buildTarget,
          },
          null,
          2
        ),
      });
    },
  };
  return {
  base: useRelativeBase ? './' : '/',
  define: {
    __BUILD_TIME__: JSON.stringify(buildTime),
    __APP_VERSION__: JSON.stringify(appPackage.version),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // 独立分包：懒加载页面从稳定入口取 useLanguage，避免与主 index 循环依赖或缓存错配时出现未定义
          if (id.replace(/\\/g, "/").includes("/src/contexts/LanguageContext")) {
            return "language-context";
          }
          if (!id.includes("node_modules")) return;
          if (id.includes("recharts") || id.includes("d3-")) return "recharts";
          if (id.includes("@tanstack")) return "tanstack-query";
          if (id.includes("lucide-react")) return "lucide";
          if (id.includes("@radix-ui")) return "radix-ui";
          if (id.includes("react-dom") || id.includes("/react/")) return "react-vendor";
          if (id.includes("react-router")) return "react-router";
          if (id.includes("date-fns") || id.includes("dayjs")) return "date-utils";
          if (id.includes("zod")) return "form-utils";
          if (id.includes("xlsx") || id.includes("exceljs") || id.includes("file-saver")) return "export-utils";
          if (id.includes("sortablejs") || id.includes("@dnd-kit")) return "sortable";
          if (id.includes("sonner")) return "sonner";
          if (id.includes("nprogress")) return "nprogress";
          if (id.includes("class-variance-authority") || id.includes("clsx") || id.includes("tailwind-merge")) return "tw-utils";
        },
      },
    },
    chunkSizeWarningLimit: 500,
    target: "es2020",
    cssCodeSplit: true,
  },
  server: {
    // true：监听 0.0.0.0，避免 Windows 上仅用 :: 时访问 localhost 异常；默认端口 8081（见 VITE_DEV_PORT）
    host: true,
    port: parseInt(process.env.VITE_DEV_PORT || "8081", 10) || 8081,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    emitVersionPlugin,
    stripStylesheetCrossoriginPlugin,

    enablePwa && VitePWA({
      registerType: "prompt", // 新版本时弹窗提示用户确认后刷新
      includeAssets: ["favicon.ico", "pwa-192x192.png", "pwa-512x512.png"],
      manifest: false, // use public/manifest.json
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          // Supabase REST cache rule removed – project has migrated to MySQL/Express API
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
};
});
