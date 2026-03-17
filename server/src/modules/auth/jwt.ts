/**
 * JWT 工具 - 供 auth 中间件使用，避免循环依赖
 */
import jwt from 'jsonwebtoken';
import { config } from '../../config/index.js';

export interface JwtPayload {
  sub: string;
  email?: string;
  tenant_id?: string;
  role?: string;
  username?: string;
  real_name?: string;
  status?: string;
  is_super_admin?: boolean;
  is_platform_super_admin?: boolean;
  iat?: number;
  exp?: number;
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;
    return decoded;
  } catch {
    return null;
  }
}
