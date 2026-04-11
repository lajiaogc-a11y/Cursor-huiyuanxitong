/**
 * 本地 API 路由处理器（异步版）
 *
 * 每个路由只做：解析参数 → 调用 adapter → 映射 DTO → 包裹统一响应。
 * 不在路由层做业务判断或持久化。
 */

import type { IWhatsAppAdapter, AdapterSession, AdapterConversation, AdapterMessage } from '../session-manager/adapterInterface.js';
import type { SessionDto, ConversationDto, MessageDto, AccountStatsDto, AddSessionResultDto, QrStatusDto } from './types.js';

const LOCAL_API_VERSION = '0.3.0';

// ── DTO 映射 ──

function toSessionDto(s: AdapterSession): SessionDto {
  return {
    id: s.id,
    accountId: s.accountId,
    name: s.name,
    phone: s.phone,
    isConnected: s.isConnected,
    state: s.state,
  };
}

function toConversationDto(c: AdapterConversation): ConversationDto {
  return {
    id: c.id,
    phone: c.phone,
    name: c.name,
    lastMessage: c.lastMessage,
    lastMessageAt: new Date(c.lastMessageAt).toISOString(),
    unreadCount: c.unreadCount,
    status: c.status,
  };
}

function toMessageDto(m: AdapterMessage): MessageDto {
  return {
    id: m.id,
    fromMe: m.fromMe,
    body: m.body,
    timestamp: new Date(m.timestamp).toISOString(),
    type: m.type as MessageDto['type'],
    status: (m.status ?? 'sent') as MessageDto['status'],
  };
}

// ── 统一响应 ──

function ok(data: unknown) {
  return { status: 200, data: { success: true, data } };
}

function fail(code: string, message: string, status = 400) {
  return { status, data: { success: false, error: { code, message } } };
}

// ── 路由分发器 ──

export type RouteResult = { status: number; data: unknown };

export function createRouteHandler(
  adapter: IWhatsAppAdapter,
  adapterMode: string = 'unknown',
): (method: string, path: string, query: URLSearchParams, body: Record<string, unknown>) => Promise<RouteResult> {

  const isDemo = adapterMode.toLowerCase().includes('demo');

  return async (method, path, query, body): Promise<RouteResult> => {

    // GET /health
    if (method === 'GET' && path === '/health') {
      const health = adapter.getHealthInfo();
      return ok({
        status: 'ok',
        version: LOCAL_API_VERSION,
        mode: adapterMode,
        isDemo,
        sessions: health.sessionsTotal,
        sessionsConnected: health.sessionsConnected,
        workersRunning: health.workersRunning,
        uptime: process.uptime(),
      });
    }

    // GET /sessions
    if (method === 'GET' && path === '/sessions') {
      return ok(adapter.getSessions().map(toSessionDto));
    }

    // POST /sessions/add  ←  新增账号（扫码登录）
    if (method === 'POST' && path === '/sessions/add') {
      const displayName = (body.displayName as string | undefined)?.trim() || 'New Account';
      const proxyUrl = (body.proxyUrl as string | undefined)?.trim() || undefined;
      const result = await adapter.addSession(displayName, proxyUrl);
      const dto: AddSessionResultDto = { sessionId: result.sessionId };
      return ok(dto);
    }

    // GET /sessions/:id/qr  ←  查询 QR 码状态（轮询）
    const qrMatch = path.match(/^\/sessions\/([^/]+)\/qr$/);
    if (method === 'GET' && qrMatch) {
      const sessionId = decodeURIComponent(qrMatch[1]);
      const result = await adapter.getSessionQr(sessionId);
      if (!result) return fail('NOT_FOUND', `Session ${sessionId} not found`, 404);
      const dto: QrStatusDto = { sessionId, state: result.state, qrDataUrl: result.qrDataUrl };
      return ok(dto);
    }

    // GET /sessions/:id/status  ←  查询登录状态（独立于 QR 码）
    const statusMatch = path.match(/^\/sessions\/([^/]+)\/status$/);
    if (method === 'GET' && statusMatch) {
      const sessionId = decodeURIComponent(statusMatch[1]);
      const result = await adapter.getLoginStatus(sessionId);
      if (!result) return fail('NOT_FOUND', `Session ${sessionId} not found`, 404);
      return ok({ sessionId, ...result });
    }

    // DELETE /sessions/:id  ←  移除账号
    const deleteMatch = path.match(/^\/sessions\/([^/]+)$/);
    if (method === 'DELETE' && deleteMatch) {
      const sessionId = decodeURIComponent(deleteMatch[1]);
      await adapter.removeSession(sessionId);
      return ok(null);
    }

    // GET /conversations?accountId=...
    if (method === 'GET' && path === '/conversations') {
      const accountId = query.get('accountId');
      if (!accountId) return fail('MISSING_PARAM', 'accountId is required');
      const convs = await adapter.getConversations(accountId);
      return ok(convs.map(toConversationDto));
    }

    // GET /messages?accountId=...&phone=...
    if (method === 'GET' && path === '/messages') {
      const accountId = query.get('accountId');
      const phone = query.get('phone');
      if (!accountId || !phone) return fail('MISSING_PARAM', 'accountId and phone are required');
      const msgs = await adapter.getMessages(accountId, phone);
      return ok(msgs.map(toMessageDto));
    }

    // POST /send
    if (method === 'POST' && path === '/send') {
      const accountId = body.accountId as string | undefined;
      const phone = body.phone as string | undefined;
      const msgBody = body.body as string | undefined;
      if (!accountId || !phone || !msgBody) return fail('MISSING_PARAM', 'accountId, phone, body are required');
      try {
        const msg = await adapter.sendMessage({ accountId, phone, body: msgBody, type: (body.type as string) ?? 'text' });
        return ok(toMessageDto(msg));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Send failed';
        return fail('SEND_FAILED', message);
      }
    }

    // POST /mark-read
    if (method === 'POST' && path === '/mark-read') {
      const accountId = body.accountId as string | undefined;
      const phone = body.phone as string | undefined;
      if (!accountId || !phone) return fail('MISSING_PARAM', 'accountId and phone are required');
      await adapter.markAsRead(accountId, phone);
      return ok(null);
    }

    // POST /update-status
    if (method === 'POST' && path === '/update-status') {
      const accountId = body.accountId as string | undefined;
      const phone = body.phone as string | undefined;
      const status = body.status as string | undefined;
      if (!accountId || !phone || !status) return fail('MISSING_PARAM', 'accountId, phone, status are required');
      await adapter.updateStatus(accountId, phone, status);
      return ok(null);
    }

    // GET /stats?accountId=...
    if (method === 'GET' && path === '/stats') {
      const accountId = query.get('accountId');
      if (!accountId) return fail('MISSING_PARAM', 'accountId is required');
      const stats: AccountStatsDto = await adapter.getStats(accountId);
      return ok(stats);
    }

    return fail('NOT_FOUND', `Unknown route: ${method} ${path}`, 404);
  };
}
