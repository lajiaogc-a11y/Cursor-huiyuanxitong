/**
 * 会员积分分类 Hook
 * - 消费积分：自己消费产生的积分
 * - 推广积分：推广用户兑换产生的积分
 * - 总积分：消费积分 + 推广积分
 * 统一调用 points/memberPointsRpcService
 */
import { useState, useEffect, useCallback } from "react";
import { getMemberPointsBreakdownRpc } from "@/services/points/memberPointsRpcService";

export interface PointsBreakdown {
  consumption_points: number;
  referral_points: number;
  total_points: number;
}

export function useMemberPointsBreakdown(memberId: string | undefined) {
  const [breakdown, setBreakdown] = useState<PointsBreakdown>({
    consumption_points: 0,
    referral_points: 0,
    total_points: 0,
  });
  const [loading, setLoading] = useState(true);

  const fetchBreakdown = useCallback(async () => {
    if (!memberId) {
      setBreakdown({ consumption_points: 0, referral_points: 0, total_points: 0 });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await getMemberPointsBreakdownRpc(memberId);
      if (result.success) {
        setBreakdown({
          consumption_points: result.consumption_points,
          referral_points: result.referral_points,
          total_points: result.total_points,
        });
      } else {
        setBreakdown({ consumption_points: 0, referral_points: 0, total_points: 0 });
      }
    } catch {
      setBreakdown({ consumption_points: 0, referral_points: 0, total_points: 0 });
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    fetchBreakdown();
  }, [fetchBreakdown]);

  return { breakdown, loading, refresh: fetchBreakdown };
}
