/**
 * 前端 API 根地址（与 apiClient 一致，无尾部斜杠）。
 * 生产前后端分域时通过 VITE_API_BASE 注入。
 */
export function getApiBaseUrl(): string {
  return String(import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
}
