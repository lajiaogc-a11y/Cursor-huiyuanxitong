/**
 * Customer Sources API Client — 纯 HTTP 请求层
 */
import { apiGet } from './client';

export const customerSourcesApi = {
  list: () => apiGet<unknown>('/api/customer-sources/'),
};
