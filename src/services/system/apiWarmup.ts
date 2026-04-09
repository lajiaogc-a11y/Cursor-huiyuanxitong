/**
 * 可选：在会员登录页预热 API 连接（减轻首登 TLS/DNS 延迟），失败静默忽略。
 */
import { apiGet } from '@/api/client';

export function warmupApiHealth(): void {
  apiGet('/health').catch((err) => {
    console.warn('[apiWarmup] health ping failed:', err);
  });
}
