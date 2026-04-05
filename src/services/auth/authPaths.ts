export const STAFF_AUTH_PATHS = {
  LOGIN: '/api/auth/login',
  LOGOUT: '/api/auth/logout',
  VERIFY_PASSWORD: '/api/auth/verify-password',
  REGISTER: '/api/auth/register',
  ME: '/api/auth/me',
  SYNC_PASSWORD: '/api/auth/sync-password',
  RPC_VERIFY_EMPLOYEE_LOGIN: '/api/data/rpc/verify_employee_login_detailed',
} as const;
