import { supabase } from "@/integrations/supabase/client";
import { fail, getErrorMessage, ok, type ServiceResult } from "@/services/serviceResult";

export async function checkApiRateLimitResult(params: {
  scope: string;
  actorKey: string;
  limit?: number;
  windowSeconds?: number;
}): Promise<ServiceResult<{ allowed: boolean; remaining: number; retryAfterSeconds: number }>> {
  try {
    const { data, error } = await supabase.rpc("check_api_rate_limit" as never, {
      p_scope: params.scope,
      p_actor_key: params.actorKey,
      p_limit: params.limit ?? 30,
      p_window_seconds: params.windowSeconds ?? 60,
    } as never);
    if (error) {
      return fail("UNKNOWN", error.message || "check_api_rate_limit failed", "COMMON", error);
    }
    const row = Array.isArray(data) ? data[0] : data;
    return ok({
      allowed: Boolean(row?.allowed),
      remaining: Number(row?.remaining ?? 0),
      retryAfterSeconds: Number(row?.retry_after_seconds ?? 0),
    });
  } catch (error) {
    return fail("UNKNOWN", getErrorMessage(error), "COMMON", error);
  }
}
