/**
 * Lazy load with retry - 解决 ChunkLoadError（网络超时、chunk 404 等）导致的间歇性加载失败
 * 当动态 import 失败时自动重试，适用于报表管理、汇率计算等大 chunk 页面
 */
import { lazy, LazyExoticComponent, ComponentType } from 'react';

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
              reject(error);
              return;
            }
            setTimeout(() => attempt(remaining - 1), interval);
          });
      };
      attempt(retries);
    })
  );
}
