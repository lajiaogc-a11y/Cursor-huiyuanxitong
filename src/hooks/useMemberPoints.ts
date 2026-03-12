/**
 * 会员积分 Hook - 通过 RPC 获取，绕过 RLS
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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
      const { data, error } = await supabase.rpc("member_get_points", {
        p_member_id: memberId,
      });
      if (error) {
        setPoints(0);
        return;
      }
      const r = data as { success?: boolean; points?: number };
      setPoints(r?.success ? Number(r.points ?? 0) : 0);
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
