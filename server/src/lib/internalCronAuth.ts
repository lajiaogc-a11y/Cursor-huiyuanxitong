import { timingSafeEqual } from 'crypto';
import type { Request } from 'express';

/** 读取专用头或 Authorization Bearer（与备份/队列处理共用约定） */
export function getInternalJobSecret(req: Request, headerName: 'x-backup-cron-secret' | 'x-webhook-processor-secret'): string {
  const x = req.headers[headerName];
  if (typeof x === 'string' && x.length > 0) return x;
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) return auth.slice(7).trim();
  return '';
}

export function timingSafeStringEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'utf8');
    const bb = Buffer.from(b, 'utf8');
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}
