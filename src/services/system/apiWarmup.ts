/**
 * 可选：在会员登录页预热 API 连接（减轻首登 TLS/DNS 延迟），失败静默忽略。
 */
export function warmupApiHealth(): void {
  const base = (import.meta.env.VITE_API_BASE as string | undefined)?.trim() ?? "";
  if (!base) return;
  const url = `${base.replace(/\/$/, "")}/health`;
  fetch(url, { mode: "cors", cache: "no-store" }).catch((err) => { console.warn('[apiWarmup] health ping failed:', err); });
}
