/**
 * Lazy load with retry - 解决 ChunkLoadError（网络超时、chunk 404 等）导致的间歇性加载失败
 * 当动态 import 失败时自动重试，适用于报表管理、汇率计算等大 chunk 页面
 *
 * 部署新版本后旧 chunk 文件会被替换（哈希不同），浏览器若仍持有旧 HTML 会加载不存在的 chunk。
 * 此函数在所有重试耗尽后检测到 ChunkLoadError，会自动刷新整个页面以获取新 HTML。
 */
import { lazy, LazyExoticComponent, ComponentType } from 'react';

const RELOAD_FLAG = '__chunk_reload__';

function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const msg = (error as Error).message || '';
  const name = (error as Error).name || '';
  return (
    name === 'ChunkLoadError' ||
    msg.includes('Loading chunk') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('error loading dynamically imported module')
  );
}

export function lazyWithRetry<T extends ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>,
  retries = 3,
  interval = 1000
): LazyExoticComponent<T> {
  return lazy(() =>
    new Promise<{ default: T }>((resolve, reject) => {
      const attempt = (remaining: number) => {
        componentImport()
          .then(resolve)
          .catch((error) => {
            if (remaining <= 1) {
              if (isChunkLoadError(error)) {
                const alreadyReloaded = sessionStorage.getItem(RELOAD_FLAG);
                if (!alreadyReloaded) {
                  sessionStorage.setItem(RELOAD_FLAG, '1');
                  window.location.reload();
                  return;
                }
                sessionStorage.removeItem(RELOAD_FLAG);
              }
              reject(error);
              return;
            }
            setTimeout(() => attempt(remaining - 1), interval);
          });
      };
      sessionStorage.removeItem(RELOAD_FLAG);
      attempt(retries);
    })
  );
}
