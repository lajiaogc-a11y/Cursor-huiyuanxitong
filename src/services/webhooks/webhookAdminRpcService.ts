/**
 * Webhook 管理：测试投递等 data RPC
 */
import { apiPost } from "@/api/client";

export async function rpcTestWebhook(webhookId: string): Promise<{ success: boolean; message: string }> {
  return apiPost<{ success: boolean; message: string }>("/api/data/rpc/webhook-processor", {
    action: "test",
    webhookId,
  });
}
