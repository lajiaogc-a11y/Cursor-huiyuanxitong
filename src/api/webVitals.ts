/**
 * Web Vitals API Client — 纯 HTTP 请求层
 */
import { apiPost } from './client';

export const webVitalsApi = {
  report: (body: Record<string, unknown>) =>
    apiPost<void>('/api/web-vitals', body),
};
