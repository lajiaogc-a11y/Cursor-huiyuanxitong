/**
 * 会员抽奖次数 Hook - 通过 RPC 获取
 * 统一调用 points/memberPointsRpcService
 */
import { useState, useEffect, useCallback } from "react";
import { getMemberSpinQuotaRpc } from "@/services/points/memberPointsRpcService";

export function useMemberSpinQuota(memberId: string | undefined) {
  const [remaining, setRemaining] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchQuota = useCallback(async () => {
    if (!memberId) {
      setRemaining(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await getMemberSpinQuotaRpc(memberId);
      setRemaining(result.remaining);
    } catch {
      setRemaining(0);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    fetchQuota();
  }, [fetchQuota]);

  return { remaining, loading, refresh: fetchQuota };
}
