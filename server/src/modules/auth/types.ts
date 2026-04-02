export interface LoginRequest {
  username: string;
  password: string;
  /** FingerprintJS visitorId；平台启用设备白名单时必填（平台超管除外） */
  device_id?: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  realName: string;
  invitationCode?: string;
}

export interface JwtPayload {
  sub: string;       // employee_id
  email?: string;    // username@system.local
  tenant_id?: string;
  role?: string;
  username?: string;
  real_name?: string;
  status?: string;
  is_super_admin?: boolean;
  is_platform_super_admin?: boolean;
  /** 启用设备白名单时写入，请求时与库中白名单核对 */
  device_id?: string;
  iat?: number;
  exp?: number;
}

export interface AuthUser {
  id: string;           // employee_id
  username: string;
  real_name: string;
  role: string;
  status: string;
  is_super_admin: boolean;
  is_platform_super_admin?: boolean;
  tenant_id?: string | null;
}

export interface LoginResponse {
  success: boolean;
  token?: string;
  user?: AuthUser;
  error?: string;
  message?: string;
  /** 登录失败时可选 HTTP 状态（如同步 last_login 等子步骤失败） */
  httpStatus?: number;
}

export interface RegisterResponse {
  success: boolean;
  error_code?: string;
  assigned_status?: string;
  message?: string;
}
