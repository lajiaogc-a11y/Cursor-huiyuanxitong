/**
 * Member Portal (会员端) API Client — 纯 HTTP 请求层
 * 覆盖 /api/member/* 端点 (注册 / 初始化等)
 */
import { apiPost } from './client';

export const memberPortalApi = {
  registerInit: (body: Record<string, unknown>) =>
    apiPost<unknown>('/api/member/register-init', body),
  register: (body: Record<string, unknown>) =>
    apiPost<unknown>('/api/member/register', body),
};
