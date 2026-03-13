/**
 * 会员积分分类 Hook
 * - 消费积分：自己消费产生的积分
 * - 推广积分：推广用户兑换产生的积分
 * - 总积分：消费积分 + 推广积分
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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
      const { data, error } = await supabase.rpc("member_get_points_breakdown", {
        p_member_id: memberId,
      });
      if (error) {
        setBreakdown({ consumption_points: 0, referral_points: 0, total_points: 0 });
        return;
      }
      const r = data as { success?: boolean; consumption_points?: number; referral_points?: number; total_points?: number };
      if (r?.success) {
        setBreakdown({
          consumption_points: Number(r.consumption_points ?? 0),
          referral_points: Number(r.referral_points ?? 0),
          total_points: Number(r.total_points ?? 0),
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
