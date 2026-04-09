/**
 * 会员抽奖模拟中奖 — 轮询 feed（会员 JWT + 租户隔离）
 * 返回：最近 10 条真实中奖（prize_type != none）+ 模拟填充，合并去重后取最新 10 条。
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { selectRecentRealWins, getMemberTenantId } from './repository.js';
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

async function getRealWinFeedItems(tenantId: string, limit = FEED_LIMIT) {
  const rows = await selectRecentRealWins(tenantId, limit);
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
