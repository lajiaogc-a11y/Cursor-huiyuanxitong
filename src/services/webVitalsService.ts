/**
 * Web Vitals 采集与上报服务
 * 在生产环境采集 LCP、CLS、INP 等 Core Web Vitals 指标并上报到数据库
 */
import { apiPost } from '@/api/client';

let employeeId: string | null = null;

/** 设置当前员工 ID（登录后调用） */
export function setWebVitalsEmployee(id: string | null) {
  employeeId = id;
}

/** 初始化 Web Vitals 采集（仅生产环境） */
export function initWebVitals() {
  if (import.meta.env.DEV) {
    console.log('[WebVitals] Skipped in dev mode');
    return;
  }

  import('web-vitals').then(({ onLCP, onCLS, onINP, onFCP, onTTFB }) => {
    const reportMetric = async (metric: { name: string; value: number; rating: string; navigationType: string }) => {
      try {
        await apiPost('/api/web-vitals', {
          metric_name: metric.name,
          metric_value: Math.round(metric.value * 100) / 100,
          rating: metric.rating,
          navigation_type: metric.navigationType,
          url: (window.location.pathname || '/') + (window.location.hash || ''),
          user_agent: navigator.userAgent.slice(0, 200),
          employee_id: employeeId,
        });
      } catch (err) {
        console.debug('[WebVitals] Report failed:', err);
      }
    };
    onLCP(reportMetric);
    onCLS(reportMetric);
    onINP(reportMetric);
    onFCP(reportMetric);
    onTTFB(reportMetric);
    console.log('[WebVitals] Initialized');
  }).catch(() => {});
}
