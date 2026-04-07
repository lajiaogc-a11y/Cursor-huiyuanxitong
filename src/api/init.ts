/**
 * API 客户端初始化 - 统一错误处理
 * 在 main.tsx 中调用
 */
import {
  setOnUnauthorized,
  setOnMemberSessionReplaced,
  setOnForbidden,
  setOnServerError,
  clearAuthToken,
  clearMemberAccessToken,
} from '@/lib/apiClient';
import { clearMemberPortalSettingsBrowserCaches } from '@/lib/memberPortalBrowserCache';
import { queryClient } from '@/lib/queryClient';
import { memberQueryKeys } from '@/lib/memberQueryKeys';
import { getSpaPathname, spaNavigate } from '@/lib/spaNavigation';
import {
  hardRedirectToMember,
  hardRedirectToStaff,
  shouldHardRedirectToMemberPortal,
  shouldHardRedirectToStaffPortal,
} from '@/lib/crossPortalNavigation';
import { notify } from "@/lib/notifyHub";
import { pickBilingual } from "@/lib/appLocale";

/** 401 时派发事件，供 AuthContext 同步清除状态 */
export const AUTH_UNAUTHORIZED_EVENT = 'auth:unauthorized';

// 防抖：避免多个并发 401 请求反复触发跳转
let unauthorizedHandled = false;
let memberSessionReplacedHandled = false;

export function initApiClient(): void {
  setOnMemberSessionReplaced(() => {
    if (memberSessionReplacedHandled) return;
    memberSessionReplacedHandled = true;
    setTimeout(() => {
      memberSessionReplacedHandled = false;
    }, 2500);

    const path = getSpaPathname();
    const isMemberRealm =
      path.startsWith('/member') || path.startsWith('/invite/') || path === '/invite' || path === '/';

    clearMemberAccessToken();
    try {
      localStorage.removeItem('member_session');
    } catch {
      /* storage unavailable */
    }
    try {
      clearMemberPortalSettingsBrowserCaches();
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem('member_saved_credentials');
    } catch {
      /* storage unavailable */
    }
    queryClient.removeQueries({ queryKey: [...memberQueryKeys.all] });
    try {
      window.dispatchEvent(new CustomEvent('member:session-clear'));
    } catch {
      /* ignore */
    }

    notify.error(
      pickBilingual("您的账号已在其他设备登录", "Your account signed in on another device"),
      {
        description: pickBilingual(
          "若非本人操作，请尽快修改密码。",
          "If this was not you, change your password as soon as possible.",
        ),
        duration: 6500,
      },
    );

    if (isMemberRealm) {
      setTimeout(() => {
        if (shouldHardRedirectToMemberPortal()) {
          hardRedirectToMember('/');
        } else {
          spaNavigate('/', { replace: true });
        }
      }, 400);
    }
  });

  setOnUnauthorized(() => {
    if (unauthorizedHandled) return;
    unauthorizedHandled = true;
    setTimeout(() => { unauthorizedHandled = false; }, 2000);

    const path = getSpaPathname();
    const isLoginPage =
      path === '/' || path.startsWith('/staff/login') || path.startsWith('/member/login');
    /** /invite/* 与 /member/* 同属会员域；「/」为会员登录根；HashRouter 须用 getSpaPathname */
    const isMemberRealm =
      path.startsWith('/member') || path.startsWith('/invite/') || path === '/invite' || path === '/';

    if (isLoginPage) return; // 登录页不处理 401

    if (isMemberRealm) {
      clearMemberAccessToken();
      try { localStorage.removeItem('member_session'); } catch { /* storage unavailable */ }
      try { clearMemberPortalSettingsBrowserCaches(); } catch { /* ignore */ }
      try { localStorage.removeItem('member_saved_credentials'); } catch { /* storage unavailable */ }
      queryClient.removeQueries({ queryKey: [...memberQueryKeys.all] });
      try {
        window.dispatchEvent(new CustomEvent('member:session-clear'));
      } catch {
        /* ignore */
      }
      notify.error(
        pickBilingual("登录已过期，请重新登录", "Session expired. Please sign in again."),
        { duration: 3000 },
      );
      setTimeout(() => {
        if (shouldHardRedirectToMemberPortal()) {
          hardRedirectToMember('/');
        } else {
          spaNavigate('/', { replace: true });
        }
      }, 300);
    } else {
      // 员工页面：清除员工 token，跳回员工登录
      clearAuthToken();
      window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
      if (shouldHardRedirectToStaffPortal()) {
        hardRedirectToStaff('/staff/login');
      } else {
        spaNavigate('/staff/login', { replace: true });
      }
    }
  });

  setOnForbidden(() => {
    notify.error(pickBilingual("权限不足", "Insufficient permission"));
  });

  setOnServerError((message) => {
    // 500 错误不跳转，只提示
    notify.error(
      message ||
        pickBilingual("服务器错误，请稍后重试", "Server error. Please try again later."),
    );
  });
}
