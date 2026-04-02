/**
 * Express async 错误捕获包装器
 * Express 4 不会自动捕获 async handler 中的 rejected promise
 * 此包装器将未捕获的错误传递给 errorHandler 中间件
 */
import type { Request, Response, NextFunction, Router } from 'express';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function isLikelyAsyncFunction(fn: unknown): boolean {
  if (typeof fn !== 'function') return false;
  const f = fn as { constructor?: { name?: string } };
  if (f.constructor && f.constructor.name === 'AsyncFunction') return true;
  return Object.prototype.toString.call(fn) === '[object AsyncFunction]';
}

export function wrapAsync(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 为整个 Router 的所有路由自动包装 async 错误处理
 * 通过遍历 router.stack 中的每个 route layer 替换 handler
 * 同时包装 router.use(async ...) 中间件（否则 rejected promise 会导致 500 / 无响应）
 */
export function wrapRouterAsync(router: Router): Router {
  const stack = (router as any).stack;
  if (!Array.isArray(stack)) return router;

  for (const layer of stack) {
    if (layer.route) {
      for (const routeLayer of layer.route.stack) {
        const original = routeLayer.handle;
        if (typeof original === 'function' && isLikelyAsyncFunction(original)) {
          routeLayer.handle = (req: Request, res: Response, next: NextFunction) => {
            Promise.resolve(original(req, res, next)).catch(next);
          };
        }
      }
    } else if (layer.handle && typeof layer.handle === 'function') {
      const h = layer.handle as (req: Request, res: Response, next: NextFunction) => unknown;
      const nestedStack = (h as unknown as { stack?: unknown }).stack;
      if (Array.isArray(nestedStack)) continue;
      if (isLikelyAsyncFunction(h)) {
        layer.handle = (req: Request, res: Response, next: NextFunction) => {
          Promise.resolve(h(req, res, next)).catch(next);
        };
      }
    }
  }
  return router;
}
