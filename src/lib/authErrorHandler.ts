/**
 * 认证错误处理器 — 集中处理 401 / 403 / 会话被替换的业务响应
 * 包含：token 清理、缓存清理、通知弹出、页面跳转
 * 由 api/init.ts 注册到 apiClient 的错误回调中
 */
import { clearAuthToken, clearMemberAccessToken, AUTH_UNAUTHORIZED_EVENT } from '@/lib/apiClient';
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
import { notify } from '@/lib/notifyHub';
import { pickBilingual } from '@/lib/appLocale';

function isMemberPath(path: string): boolean {
  return path.startsWith('/member') || path.startsWith('/invite/') || path === '/invite' || path === '/';
}

function isLoginPath(path: string): boolean {
  return path === '/' || path.startsWith('/staff/login') || path.startsWith('/member/login');
}

function clearMemberSession(): void {
  clearMemberAccessToken();
  try { localStorage.removeItem('member_session'); } catch { /* storage unavailable */ }
  try { clearMemberPortalSettingsBrowserCaches(); } catch { /* ignore */ }
  try { localStorage.removeItem('member_saved_credentials'); } catch { /* storage unavailable */ }
  queryClient.removeQueries({ queryKey: [...memberQueryKeys.all] });
  try { window.dispatchEvent(new CustomEvent('member:session-clear')); } catch { /* ignore */ }
}

function redirectMemberToLogin(delayMs = 300): void {
  setTimeout(() => {
    if (shouldHardRedirectToMemberPortal()) {
      hardRedirectToMember('/');
    } else {
      spaNavigate('/', { replace: true });
    }
  }, delayMs);
}

/** 处理会员 token 被其他设备顶替（session replaced） */
export function handleMemberSessionReplaced(): void {
  const path = getSpaPathname();
  clearMemberSession();
  notify.error(
    pickBilingual('您的账号已在其他设备登录', 'Your account signed in on another device'),
    {
      description: pickBilingual(
        '若非本人操作，请尽快修改密码。',
        'If this was not you, change your password as soon as possible.',
      ),
      duration: 6500,
    },
  );
  if (isMemberPath(path)) {
    redirectMemberToLogin(400);
  }
}

/** 处理 401 未授权 */
export function handleUnauthorized(): void {
  const path = getSpaPathname();
  if (isLoginPath(path)) return;

  if (isMemberPath(path)) {
    clearMemberSession();
    notify.error(
      pickBilingual('登录已过期，请重新登录', 'Session expired. Please sign in again.'),
      { duration: 3000 },
    );
    redirectMemberToLogin(300);
  } else {
    clearAuthToken();
    window.dispatchEvent(new Event(AUTH_UNAUTHORIZED_EVENT));
    if (shouldHardRedirectToStaffPortal()) {
      hardRedirectToStaff('/staff/login');
    } else {
      spaNavigate('/staff/login', { replace: true });
    }
  }
}

/** 处理 403 权限不足 */
export function handleForbidden(): void {
  notify.error(pickBilingual('权限不足', 'Insufficient permission'));
}

/** 处理 500 服务器错误 */
export function handleServerError(message?: string): void {
  notify.error(
    message || pickBilingual('服务器错误，请稍后重试', 'Server error. Please try again later.'),
  );
}
