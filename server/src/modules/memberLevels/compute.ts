import type { MemberLevelRuleRow } from './types.js';

/**
 * 匹配最大 required_points <= totalPoints 的等级（同分按 level_order 较大者优先，再按 id）。
 */
export function pickLevelRuleForTotalPoints(
  rules: MemberLevelRuleRow[],
  totalPoints: number,
): MemberLevelRuleRow | null {
  if (!rules.length) return null;
  const t = Number(totalPoints);
  const safe = Number.isFinite(t) ? t : 0;
  let best: MemberLevelRuleRow | null = null;
  for (const r of rules) {
    const req = Number(r.required_points);
    if (!Number.isFinite(req) || req > safe) continue;
    if (!best) {
      best = r;
      continue;
    }
    const breq = Number(best.required_points);
    if (req > breq) {
      best = r;
    } else if (req === breq) {
      if (Number(r.level_order) > Number(best.level_order)) best = r;
      else if (Number(r.level_order) === Number(best.level_order) && r.id > best.id) best = r;
    }
  }
  return best;
}
