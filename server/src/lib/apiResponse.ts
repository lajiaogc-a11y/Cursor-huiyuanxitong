/**
 * 统一 API 响应工具
 * 所有新接口必须使用此模块；旧接口逐步迁移。
 *
 * 标准成功：  { success: true, data: T }
 * 标准失败：  { success: false, error: { code: string, message: string } }
 */
import type { Response } from 'express';

// ─── 统一错误码 ──────────────────────────────────────────────

export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  TENANT_REQUIRED: 'TENANT_REQUIRED',
  TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',
  NO_PERMISSION: 'NO_PERMISSION',
  RATE_LIMIT: 'RATE_LIMIT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  CONFLICT: 'CONFLICT',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ─── 响应辅助 ──────────────────────────────────────────────

export function apiSuccess<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ success: true, data });
}

export function apiError(
  res: Response,
  code: string,
  message: string,
  status = 400,
): void {
  res.status(status).json({
    success: false,
    error: { code, message },
  });
}

export function api403(res: Response, message = 'No permission'): void {
  apiError(res, ErrorCodes.FORBIDDEN, message, 403);
}

export function api404(res: Response, message = 'Not found'): void {
  apiError(res, ErrorCodes.NOT_FOUND, message, 404);
}

export function api500(res: Response, message = 'Internal server error'): void {
  apiError(res, ErrorCodes.INTERNAL_ERROR, message, 500);
}
