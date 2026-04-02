import type { Request } from 'express';

/** 从 Express 请求解析客户端 IP（与 ipAccessControl 中间件一致） */
export function getRequestClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  const raw = (typeof xff === 'string' ? xff.split(',')[0].trim() : req.ip) || '127.0.0.1';
  return raw.replace(/^::ffff:/, '');
}
