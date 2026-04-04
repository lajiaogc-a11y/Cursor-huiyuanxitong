/**
 * 统一错误处理中间件
 */
import type { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

const isProduction = process.env.NODE_ENV === 'production';

export function errorHandler(
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  const code = err.code ?? 'INTERNAL_ERROR';

  console.error('[ErrorHandler]', err);

  // 生产环境不向客户端暴露详细错误信息，防止信息泄露
  const message = isProduction && statusCode === 500
    ? 'Internal server error. Please try again later.'
    : (err.message ?? 'Internal server error. Please try again later.');

  res.status(statusCode).json({
    success: false,
    code,
    message,
  });
}
