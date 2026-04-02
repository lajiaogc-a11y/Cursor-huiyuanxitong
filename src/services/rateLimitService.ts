/**
 * Rate Limit Service — stub implementation.
 * Backend API not yet available; always allows the request.
 */

import { ok, type ServiceResult } from "@/services/serviceResult";

export async function checkApiRateLimitResult(params: {
  scope: string;
  actorKey: string;
  limit?: number;
  windowSeconds?: number;
}): Promise<ServiceResult<{ allowed: boolean; remaining: number; retryAfterSeconds: number }>> {
  return ok({
    allowed: true,
    remaining: params.limit ?? 30,
    retryAfterSeconds: 0,
  });
}
