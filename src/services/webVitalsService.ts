/**
 * Web Vitals 采集与上报服务
 * 在生产环境采集 LCP、CLS、INP 等 Core Web Vitals 指标并上报到数据库
 */
import { onLCP, onCLS, onINP, onFCP, onTTFB, type Metric } from 'web-vitals';
import { supabase } from '@/integrations/supabase/client';

let employeeId: string | null = null;

/** 设置当前员工 ID（登录后调用） */
export function setWebVitalsEmployee(id: string | null) {
  employeeId = id;
}

/** 上报单个指标到数据库 */
async function reportMetric(metric: Metric) {
  try {
    await supabase.from('web_vitals').insert({
      metric_name: metric.name,
      metric_value: Math.round(metric.value * 100) / 100,
      rating: metric.rating,
      navigation_type: metric.navigationType,
      url: (window.location.pathname || '/') + (window.location.hash || ''),
      user_agent: navigator.userAgent.slice(0, 200),
      employee_id: employeeId,
    });
  } catch (err) {
    // 静默失败，不影响用户体验
    console.debug('[WebVitals] Report failed:', err);
  }
}

/** 初始化 Web Vitals 采集（仅生产环境） */
export function initWebVitals() {
  // 仅在生产环境采集
  if (import.meta.env.DEV) {
    console.log('[WebVitals] Skipped in dev mode');
    return;
  }

  onLCP(reportMetric);
  onCLS(reportMetric);
  onINP(reportMetric);
  onFCP(reportMetric);
  onTTFB(reportMetric);

  console.log('[WebVitals] Initialized');
}
