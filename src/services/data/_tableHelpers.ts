import { apiGet, apiPost, apiPatch, apiDelete } from '@/api/client';

const _T = (t: string) => `/api/data/table/${t}`;

export const tableGet = <R = unknown>(table: string, q?: string) =>
  apiGet<R>(`${_T(table)}${q ? `?${q}` : ''}`);

export const tablePost = <R = unknown>(table: string, body: unknown) =>
  apiPost<R>(_T(table), body);

export const tablePatch = <R = unknown>(table: string, filter: string, body: unknown) =>
  apiPatch<R>(`${_T(table)}?${filter}`, body);

export const tableDelete = (table: string, filter: string) =>
  apiDelete(`${_T(table)}?${filter}`);
