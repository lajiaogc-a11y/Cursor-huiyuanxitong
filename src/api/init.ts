/**
 * API 客户端初始化 — 注册全局错误回调
 * 业务处理逻辑统一在 @/lib/authErrorHandler
 */
import {
  setOnUnauthorized,
  setOnMemberSessionReplaced,
  setOnForbidden,
  setOnServerError,
} from '@/lib/apiClient';
import {
  handleMemberSessionReplaced,
  handleUnauthorized,
  handleForbidden,
  handleServerError,
} from '@/lib/authErrorHandler';

// 防抖：避免多个并发请求反复触发
let unauthorizedHandled = false;
let memberSessionReplacedHandled = false;

export function initApiClient(): void {
  setOnMemberSessionReplaced(() => {
    if (memberSessionReplacedHandled) return;
    memberSessionReplacedHandled = true;
    setTimeout(() => { memberSessionReplacedHandled = false; }, 2500);
    handleMemberSessionReplaced();
  });

  setOnUnauthorized(() => {
    if (unauthorizedHandled) return;
    unauthorizedHandled = true;
    setTimeout(() => { unauthorizedHandled = false; }, 2000);
    handleUnauthorized();
  });

  setOnForbidden(() => handleForbidden());

  setOnServerError((message) => handleServerError(message));
}
