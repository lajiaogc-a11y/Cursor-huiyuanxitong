import { maskRankingDisplayName } from '../../lib/maskRankingDisplayName.js';
import { queryMergedRankingCandidates } from './repository.js';

export type InviteRankingEntry = {
  name: string;
  invite_count: number;
  is_fake: boolean;
};

export async function getInviteRankingTop5(tenantId: string): Promise<InviteRankingEntry[]> {
  const rows = await queryMergedRankingCandidates(tenantId);
  const top = rows.slice(0, 5);
  return top.map((r) => {
    const label = String(r.display_name || '').trim() || '—';
    return {
      name: maskRankingDisplayName(label),
      invite_count: Math.max(0, Math.floor(Number(r.invite_count) || 0)),
      is_fake: r.kind === 'fake',
    };
  });
}
