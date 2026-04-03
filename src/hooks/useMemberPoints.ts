/**
 * 会员积分 Hook - 通过 RPC 获取；与 memberQueryKeys.points 绑定便于 mutation 后 invalidate
 */
import { useQuery } from '@tanstack/react-query';
import { getMemberPointsRpc } from '@/services/memberPortal/memberPointsPortalService';
import { memberQueryKeys } from '@/lib/memberQueryKeys';

export function useMemberPoints(memberId: string | undefined) {
  const q = useQuery({
    queryKey: memberId ? memberQueryKeys.points(memberId) : ['member', 'points', '__none'],
    queryFn: async () => {
      const result = await getMemberPointsRpc(memberId!);
      return {
        points: Number(result.points ?? 0),
        frozen_points: Number(result.frozen_points ?? 0),
      };
    },
    enabled: !!memberId,
    retry: 2,
  });

  return {
    points: q.data?.points ?? 0,
    frozenPoints: q.data?.frozen_points ?? 0,
    loading: q.isLoading,
    error: q.isError,
    refresh: () => q.refetch(),
  };
}
