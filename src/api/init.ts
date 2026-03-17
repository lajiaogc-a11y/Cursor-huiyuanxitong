/**
 * API 客户端初始化 - 统一错误处理
 * 在 main.tsx 中调用
 */
import { setOnUnauthorized, setOnForbidden, setOnServerError, clearAuthToken } from '@/lib/apiClient';
import { toast } from 'sonner';

/** 401 时派发事件，供 AuthContext 同步清除状态，避免登录后闪退 */
export const AUTH_UNAUTHORIZED_EVENT = 'auth:unauthorized';

export function initApiClient(): void {
  setOnUnauthorized(() => {
    clearAuthToken();
    window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
    const path = window.location.pathname;
    const isLoginPage = path === '/' || path.startsWith('/staff/login') || path.startsWith('/member/login');
    if (!isLoginPage) {
      window.location.href = path.startsWith('/member') ? '/member/login' : '/staff/login';
    }
  });

  setOnForbidden(() => {
    toast.error('权限不足');
  });

  setOnServerError((message) => {
    toast.error(message || '服务器错误，请稍后重试');
  });
}
