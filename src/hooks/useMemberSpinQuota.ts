/**
 * 会员抽奖次数 Hook — 与 memberQueryKeys.spin 绑定，抽奖/签到/分享后 invalidate 即可刷新首页与转盘页
 */
import { useQuery } from '@tanstack/react-query';
import { getLotteryQuota } from '@/services/memberPortal/memberLotteryPageService';
import { memberQueryKeys } from '@/lib/memberQueryKeys';

export function useMemberSpinQuota(memberId: string | undefined) {
  const q = useQuery({
    queryKey: memberId ? memberQueryKeys.spin(memberId) : ['member', 'spin', '__none'],
    queryFn: async () => {
      const result = await getLotteryQuota(memberId!);
      return result.remaining ?? 0;
    },
    enabled: !!memberId,
    retry: 2,
  });

  return {
    remaining: q.data ?? 0,
    loading: q.isLoading,
    error: q.isError,
    refresh: () => q.refetch(),
  };
}
