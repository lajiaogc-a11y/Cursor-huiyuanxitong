/**
 * 会员抽奖模拟中奖 — 轮询 feed（会员 JWT + 租户隔离）
 * 返回：最近 10 条真实中奖（prize_type != none）+ 模拟填充，合并去重后取最新 10 条。
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { getMemberTenantId } from './repository.js';
import { query } from '../../database/index.js';
import {
  getSimulationSettingsRow,
  listSimulationFeedForTenant,
  purgeSimulationFeedOlderThan,
} from './simulationFeedRepository.js';
import {
  formatSimulationPrizeNameForMemberFeed,
  formatSpinSimulationCongratsLine,
} from './spinSimulationFeedText.js';

const FEED_LIMIT = 10;

/** 手机号末四位可见，其余 * 脱敏；无手机号时回退到 member_code 或 User */
function maskDisplayName(phone: string | null | undefined, memberCode: string | null | undefined): string {
  const p = String(phone ?? '').trim();
  if (p.length >= 4) {
    return `${'*'.repeat(Math.max(1, p.length - 4))}${p.slice(-4)}`;
  }
  const c = String(memberCode ?? '').trim();
  if (c) {
    return c.length > 6 ? `${c.slice(0, 3)}***` : c;
  }
  return 'User';
}

/** 从 lottery_logs 拉最近 N 条真实中奖（排除感谢参与），格式化为 feed item */
async function getRealWinFeedItems(tenantId: string, limit = FEED_LIMIT) {
  const rows = await query<{
    id: string;
    prize_name: string;
    prize_type: string;
    created_at: Date | string;
    phone_number?: string | null;
    member_code?: string | null;
  }>(
    `SELECT l.id, l.prize_name, l.prize_type, l.created_at,
            m.phone_number, m.member_code
     FROM lottery_logs l
     LEFT JOIN profiles m ON m.id = l.member_id
     WHERE l.tenant_id = ?
       AND l.prize_type IN ('points', 'custom')
       AND l.reward_status != 'failed'
     ORDER BY l.created_at DESC
     LIMIT ?`,
    [tenantId, limit],
  );
  return rows.map((r) => {
    const at = r.created_at instanceof Date
      ? r.created_at.getTime()
      : new Date(r.created_at).getTime();
    const displayName = maskDisplayName(r.phone_number, r.member_code);
    const prizeName = formatSimulationPrizeNameForMemberFeed(r.prize_name);
    return {
      id: `real:${r.id}`,
      text: formatSpinSimulationCongratsLine(displayName, prizeName),
      at,
    };
  });
}

export async function spinSimFeedController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const memberId = req.user?.id;
  if (!memberId || req.user?.type !== 'member') {
    res.status(403).json({ success: false, error: { code: 'MEMBER_JWT_REQUIRED', message: 'Member session required' } });
    return;
  }
  const tenantId = await getMemberTenantId(memberId);
  if (!tenantId) {
    res.json({ success: true, items: [] });
    return;
  }
  try {
    const [settings, realItems] = await Promise.all([
      getSimulationSettingsRow(tenantId),
      getRealWinFeedItems(tenantId, FEED_LIMIT),
    ]);
    await purgeSimulationFeedOlderThan(tenantId, settings.retention_days);
    const simItems = await listSimulationFeedForTenant(tenantId, 40);

    // Merge: real wins first, then simulation fill; deduplicate by id; keep newest FEED_LIMIT
    const seen = new Set<string>();
    const merged: { id: string; text: string; at: number }[] = [];
    for (const item of [...realItems, ...simItems]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }
    merged.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
    const items = merged.slice(0, FEED_LIMIT);

    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: (e as Error).message || 'Failed' });
  }
}
