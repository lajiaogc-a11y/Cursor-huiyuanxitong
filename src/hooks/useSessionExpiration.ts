import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * 监听 Supabase 会话过期事件，弹出重新登录提示
 * 当 token 刷新失败时，引导用户重新登录
 */
export function useSessionExpiration() {
  const hasShownToast = useRef(false);
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED') {
        // Token 刷新成功，重置标记
        hasShownToast.current = false;
      }
      
      if (event === 'SIGNED_OUT') {
        // 如果不是用户主动登出（检查是否是因 token 过期被踢出）
        // 仅在有过活跃会话时才提示
        if (!hasShownToast.current) {
          hasShownToast.current = true;
          // 延迟检查，避免与正常登出冲突
          setTimeout(() => {
            // 兼容 HashRouter：pathname 可能在 hash 中
            const path = window.location.hash ? window.location.hash.slice(1) || '/' : window.location.pathname;
            if (path !== '/login' && path !== '/signup' && path !== '/pending') {
              toast.error('会话已过期，请重新登录', {
                duration: 8000,
                description: 'Your session has expired. Please log in again.',
                action: {
                  label: '重新登录',
                  onClick: () => {
                    navigate('/login', { replace: true });
                  },
                },
              });
            }
          }, 500);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigate]);
}
