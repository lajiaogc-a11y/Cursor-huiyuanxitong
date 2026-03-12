/**
 * 会员抽奖次数 Hook - 通过 RPC 获取
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

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
      const { data, error } = await supabase.rpc("member_get_spin_quota", {
        p_member_id: memberId,
      });
      if (error) {
        setRemaining(0);
        return;
      }
      const r = data as { success?: boolean; remaining?: number };
      setRemaining(r?.success ? Number(r.remaining ?? 0) : 0);
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
