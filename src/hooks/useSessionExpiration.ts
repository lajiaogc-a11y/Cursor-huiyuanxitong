import { useEffect, useRef } from 'react';
import { hasAuthToken } from '@/api/client';
import { getCurrentUserApi } from '@/services/auth/authApiService';

const SESSION_CHECK_INTERVAL = 60 * 1000;

/**
 * 定期验证 JWT 会话有效性
 * 当 /api/auth/me 返回 401 时，api 客户端会触发 onUnauthorized 清除 token 并跳转登录
 */
export function useSessionExpiration() {
  const checkingRef = useRef(false);

  useEffect(() => {
    const checkSession = async () => {
      if (checkingRef.current || !hasAuthToken()) return;
      checkingRef.current = true;
      try {
        await getCurrentUserApi();
      } catch {
        // 401 等错误由 api 客户端的 onUnauthorized 处理
      } finally {
        checkingRef.current = false;
      }
    };

    const initialDelay = setTimeout(() => {
      checkSession();
    }, 1500);
    const intervalId = setInterval(checkSession, SESSION_CHECK_INTERVAL);
    return () => {
      clearTimeout(initialDelay);
      clearInterval(intervalId);
    };
  }, []);
}
