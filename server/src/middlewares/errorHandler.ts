/**
 * 统一错误处理中间件
 */
import type { Request, Response, NextFunction } from 'express';

export interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: ApiError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500;
  const code = err.code ?? 'INTERNAL_ERROR';
  const message = err.message ?? 'Internal Server Error';

  console.error('[ErrorHandler]', err);

  res.status(statusCode).json({
    success: false,
    code,
    message,
  });
}
