/**
 * Webhook 管理：测试投递等 data RPC
 */
import { webhooksApi } from "@/api/webhooks";

export async function rpcTestWebhook(webhookId: string): Promise<{ success: boolean; message: string }> {
  return webhooksApi.testDelivery(webhookId);
}
