/**
 * 会员积分 Hook - 通过 RPC 获取，绕过 RLS
 * 统一调用 points/memberPointsRpcService
 */
import { useState, useEffect, useCallback } from "react";
import { getMemberPointsRpc } from "@/services/points/memberPointsRpcService";

export function useMemberPoints(memberId: string | undefined) {
  const [points, setPoints] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchPoints = useCallback(async () => {
    if (!memberId) {
      setPoints(0);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await getMemberPointsRpc(memberId);
      setPoints(result.points);
    } catch {
      setPoints(0);
    } finally {
      setLoading(false);
    }
  }, [memberId]);

  useEffect(() => {
    fetchPoints();
  }, [fetchPoints]);

  return { points, loading, refresh: fetchPoints };
}
