// ============= Webhook Processor Edge Function =============
// 处理 Webhook 事件队列，执行 HTTP 投递，支持重试和日志记录

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Webhook {
  id: string;
  name: string;
  url: string;
  secret: string | null;
  events: string[];
  status: string;
  headers: Record<string, string> | null;
  retry_count: number;
  timeout_ms: number;
  total_deliveries: number;
  successful_deliveries: number;
  failed_deliveries: number;
}

interface WebhookEvent {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  retry_count: number;
  max_retries: number;
  status: string;
}

// 生成 HMAC 签名
async function generateSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// 投递 Webhook
async function deliverWebhook(
  webhook: Webhook,
  eventType: string,
  payload: Record<string, unknown>,
  attemptCount: number
): Promise<{
  success: boolean;
  responseStatus: number | null;
  responseBody: string | null;
  responseTimeMs: number;
  errorMessage: string | null;
}> {
  const startTime = Date.now();
  const payloadString = JSON.stringify(payload);
  
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': eventType,
      'X-Webhook-Delivery-Id': crypto.randomUUID(),
      'X-Webhook-Attempt': attemptCount.toString(),
      ...(webhook.headers || {}),
    };

    // 如果有 secret，添加签名
    if (webhook.secret) {
      const signature = await generateSignature(payloadString, webhook.secret);
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), webhook.timeout_ms);

    const response = await fetch(webhook.url, {
      method: 'POST',
      headers,
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const responseBody = await response.text();
    const responseTimeMs = Date.now() - startTime;

    return {
      success: response.ok,
      responseStatus: response.status,
      responseBody: responseBody.substring(0, 1000), // 限制存储长度
      responseTimeMs,
      errorMessage: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error: any) {
    const responseTimeMs = Date.now() - startTime;
    return {
      success: false,
      responseStatus: null,
      responseBody: null,
      responseTimeMs,
      errorMessage: error.name === 'AbortError' ? 'Request timeout' : error.message,
    };
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action, webhookId, eventType, payload } = body;

    // ============= 测试 Webhook 连通性 =============
    if (action === 'test') {
      const { data: webhook, error: webhookError } = await supabase
        .from('webhooks')
        .select('*')
        .eq('id', webhookId)
        .single();

      if (webhookError || !webhook) {
        return new Response(
          JSON.stringify({ success: false, message: 'Webhook not found' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const testPayload = {
        event: 'test',
        timestamp: new Date().toISOString(),
        message: 'This is a test webhook delivery',
      };

      const result = await deliverWebhook(webhook, 'test', testPayload, 1);

      // 记录测试投递日志
      await supabase.from('webhook_delivery_logs').insert({
        webhook_id: webhookId,
        event_type: 'test',
        payload: testPayload,
        response_status: result.responseStatus,
        response_body: result.responseBody,
        response_time_ms: result.responseTimeMs,
        attempt_count: 1,
        success: result.success,
        error_message: result.errorMessage,
      });

      return new Response(
        JSON.stringify({
          success: result.success,
          message: result.success
            ? `Test successful! Response: ${result.responseStatus} in ${result.responseTimeMs}ms`
            : `Test failed: ${result.errorMessage}`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============= 触发事件（入队） =============
    if (action === 'trigger') {
      // 调用数据库函数入队
      const { data: eventId, error: queueError } = await supabase.rpc('queue_webhook_event', {
        p_event_type: eventType,
        p_payload: payload,
      });

      if (queueError) {
        console.error('Failed to queue event:', queueError);
        return new Response(
          JSON.stringify({ success: false, error: queueError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // 异步处理队列（不阻塞响应）
      processEventQueue(supabase).catch(err => {
        console.error('[WebhookProcessor] Background processing error:', err);
      });

      return new Response(
        JSON.stringify({ success: true, eventId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============= 处理队列（可由 CRON 调用） =============
    if (action === 'process_queue') {
      const result = await processEventQueue(supabase);
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  } catch (error: any) {
    console.error('Webhook processor error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

// ============= 处理事件队列 =============
async function processEventQueue(supabase: any): Promise<{ processed: number; succeeded: number; failed: number }> {
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  // 获取待处理的事件（pending 或需要重试的）
  const { data: events, error: eventsError } = await supabase
    .from('webhook_event_queue')
    .select('*')
    .or('status.eq.pending,and(status.eq.failed,next_retry_at.lte.now())')
    .order('created_at', { ascending: true })
    .limit(50);

  if (eventsError || !events || events.length === 0) {
    console.log('[WebhookProcessor] No events to process');
    return { processed: 0, succeeded: 0, failed: 0 };
  }

  console.log(`[WebhookProcessor] Processing ${events.length} events`);

  for (const event of events as WebhookEvent[]) {
    // 获取订阅此事件类型的活跃 Webhooks
    const { data: webhooks, error: webhooksError } = await supabase
      .from('webhooks')
      .select('*')
      .eq('status', 'active')
      .contains('events', [event.event_type]);

    if (webhooksError || !webhooks || webhooks.length === 0) {
      // 没有订阅者，标记为已处理
      await supabase
        .from('webhook_event_queue')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('id', event.id);
      continue;
    }

    let allSucceeded = true;

    for (const webhook of webhooks as Webhook[]) {
      const attemptCount = event.retry_count + 1;
      const result = await deliverWebhook(webhook, event.event_type, event.payload, attemptCount);

      // 记录投递日志
      await supabase.from('webhook_delivery_logs').insert({
        webhook_id: webhook.id,
        event_type: event.event_type,
        payload: event.payload,
        response_status: result.responseStatus,
        response_body: result.responseBody,
        response_time_ms: result.responseTimeMs,
        attempt_count: attemptCount,
        success: result.success,
        error_message: result.errorMessage,
      });

      // 更新 Webhook 统计
      await supabase
        .from('webhooks')
        .update({
          last_triggered_at: new Date().toISOString(),
          total_deliveries: webhook.total_deliveries + 1,
          successful_deliveries: webhook.successful_deliveries + (result.success ? 1 : 0),
          failed_deliveries: webhook.failed_deliveries + (result.success ? 0 : 1),
        })
        .eq('id', webhook.id);

      if (!result.success) {
        allSucceeded = false;
      }
    }

    processed++;

    if (allSucceeded) {
      // 所有投递成功，标记为已处理
      await supabase
        .from('webhook_event_queue')
        .update({ status: 'processed', processed_at: new Date().toISOString() })
        .eq('id', event.id);
      succeeded++;
    } else {
      // 有失败的投递，检查是否需要重试
      const newRetryCount = event.retry_count + 1;
      if (newRetryCount >= event.max_retries) {
        // 达到最大重试次数，标记为失败
        await supabase
          .from('webhook_event_queue')
          .update({ status: 'failed', processed_at: new Date().toISOString() })
          .eq('id', event.id);
        failed++;
      } else {
        // 计算下次重试时间（指数退避：1分钟、2分钟、4分钟...）
        const delayMinutes = Math.pow(2, newRetryCount - 1);
        const nextRetryAt = new Date(Date.now() + delayMinutes * 60 * 1000);
        
        await supabase
          .from('webhook_event_queue')
          .update({
            status: 'failed',
            retry_count: newRetryCount,
            next_retry_at: nextRetryAt.toISOString(),
          })
          .eq('id', event.id);
      }
    }
  }

  console.log(`[WebhookProcessor] Completed: processed=${processed}, succeeded=${succeeded}, failed=${failed}`);
  return { processed, succeeded, failed };
}
