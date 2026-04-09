/**
 * Webhook 管理：测试投递等 data RPC
 */
import { dataRpcApi } from "@/api/data";

export async function rpcTestWebhook(webhookId: string): Promise<{ success: boolean; message: string }> {
  return dataRpcApi.call<{ success: boolean; message: string }>("webhook-processor", {
    action: "test",
    webhookId,
  });
}
