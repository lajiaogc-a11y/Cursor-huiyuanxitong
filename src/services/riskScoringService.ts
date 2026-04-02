// ============= 综合风险评分服务 =============
// 多维度风险信号合成，计算实时风险分数
// 已从 Supabase 直连改为后端 API 调用

import { apiGet, apiPost } from '@/api/client';

export type RiskEventType = 'login_anomaly' | 'order_anomaly' | 'rate_anomaly' | 'frequency_anomaly' | 'ip_anomaly';
export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

// 各事件类型的权重
const EVENT_WEIGHTS: Record<RiskEventType, number> = {
  login_anomaly: 15,
  order_anomaly: 25,
  rate_anomaly: 20,
  frequency_anomaly: 20,
  ip_anomaly: 20,
};

// 严重程度乘数
const SEVERITY_MULTIPLIERS: Record<RiskSeverity, number> = {
  low: 0.3,
  medium: 0.6,
  high: 0.85,
  critical: 1.0,
};

export interface RiskEvent {
  id: string;
  employee_id: string;
  event_type: RiskEventType;
  severity: RiskSeverity;
  score: number;
  details: Record<string, unknown>;
  resolved: boolean;
  created_at: string;
}

export interface RiskScore {
  id: string;
  employee_id: string;
  current_score: number;
  risk_level: string;
  factors: Record<string, number>;
  last_calculated_at: string;
  auto_action_taken: string | null;
}

/**
 * 记录风险事件
 */
export async function recordRiskEvent(
  employeeId: string,
  eventType: RiskEventType,
  severity: RiskSeverity,
  details: Record<string, unknown>
): Promise<void> {
  const score = Math.round(EVENT_WEIGHTS[eventType] * SEVERITY_MULTIPLIERS[severity]);

  try {
    await apiPost('/api/risk/events', {
      employee_id: employeeId,
      event_type: eventType,
      severity,
      score,
      details,
    });
  } catch (err) {
    console.error('[RiskScoring] Failed to record risk event:', err);
  }

  // 重新计算该员工的综合分数
  await recalculateRiskScore(employeeId);
}

/**
 * 重新计算员工的综合风险分数
 * 基于最近 24 小时未解决的风险事件
 */
export async function recalculateRiskScore(employeeId: string): Promise<number> {
  try {
    const result = await apiPost<{ score: number }>('/api/risk/recalculate', {
      employee_id: employeeId,
    });
    return result?.score ?? 0;
  } catch (err) {
    console.error('[RiskScoring] Failed to recalculate risk score:', err);
    return 0;
  }
}

/**
 * 获取所有员工的风险评分
 */
export async function getAllRiskScores(): Promise<RiskScore[]> {
  try {
    const data = await apiGet<RiskScore[]>('/api/risk/scores');
    return data || [];
  } catch (err) {
    console.error('[RiskScoring] Failed to get all risk scores:', err);
    return [];
  }
}

/**
 * 获取最近的风险事件
 */
export async function getRecentRiskEvents(limit: number = 50): Promise<RiskEvent[]> {
  try {
    const data = await apiGet<RiskEvent[]>(`/api/risk/events?limit=${limit}`);
    return data || [];
  } catch (err) {
    console.error('[RiskScoring] Failed to get recent risk events:', err);
    return [];
  }
}

/**
 * 解决风险事件
 */
export async function resolveRiskEvent(eventId: string, resolvedById: string): Promise<void> {
  try {
    await apiPost('/api/risk/events/resolve', {
      event_id: eventId,
      resolved_by: resolvedById,
    });
  } catch (err) {
    console.error('[RiskScoring] Failed to resolve risk event:', err);
  }
}

/**
 * 检测登录异常（连续失败）
 */
export async function checkLoginAnomaly(employeeId: string): Promise<void> {
  try {
    await apiPost('/api/risk/check-login-anomaly', {
      employee_id: employeeId,
    });
  } catch (err) {
    console.error('[RiskScoring] Failed to check login anomaly:', err);
  }
}

/**
 * 检测操作频率异常
 */
export async function checkFrequencyAnomaly(employeeId: string, operatorAccount: string): Promise<void> {
  try {
    await apiPost('/api/risk/check-frequency-anomaly', {
      employee_id: employeeId,
      operator_account: operatorAccount,
    });
  } catch (err) {
    console.error('[RiskScoring] Failed to check frequency anomaly:', err);
  }
}
