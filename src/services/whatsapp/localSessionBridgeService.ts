/**
 * 本地会话桥接 Service
 *
 * 职责：
 *   - 为页面层提供稳定的方法签名（getSessions / getConversations / …）
 *   - 调用 API Client（localWhatsappBridge）获取数据
 *   - companion 离线时抛出 CompanionOfflineError，由页面层展示
 *   - 在本层添加排序等纯业务逻辑
 *
 * P0 规则：
 *   - 不存在 mock fallback，companion 离线 = 抛错
 *   - 不直接发后端请求，不操作 DOM
 */

import type { ConversationStatus } from './conversationStatusService';
import { statusSortWeight } from './conversationStatusService';
import {
  localWhatsappBridge,
  type WaSession as BridgeSession,
  type WaConversation as BridgeConversation,
  type WaMessage as BridgeMessage,
  type SendPayload as BridgeSendPayload,
  type AccountStats as BridgeAccountStats,
  type BridgeResult,
} from '@/api/localWhatsappBridge';

// ── 类型 ──

export interface WaSession {
  id: string;
  accountId: string;
  name: string;
  phone?: string;
  isConnected: boolean;
}

export interface WaConversation {
  id: string;
  phone: string;
  name: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  status: ConversationStatus;
}

export interface WaMessage {
  id: string;
  fromMe: boolean;
  body: string;
  timestamp: string;
  status?: 'sent' | 'delivered' | 'read';
}

export interface SendPayload {
  accountId: string;
  phone: string;
  body: string;
  type?: 'text' | 'image' | 'file';
}

export interface AccountStats {
  totalConversations: number;
  unreadCount: number;
  readNoReplyCount: number;
  followUpCount: number;
  priorityCount: number;
}

// ── 自定义错误 ──

export class CompanionOfflineError extends Error {
  code = 'COMPANION_OFFLINE';
  constructor(message?: string) {
    super(message ?? '本地 WhatsApp Companion 未运行');
    this.name = 'CompanionOfflineError';
  }
}

export class BridgeError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
  }
}

// ── 内部工具 ──

function unwrap<T>(result: BridgeResult<T>): T {
  if (result.success) return result.data;
  if (result.error.code === 'COMPANION_OFFLINE') {
    throw new CompanionOfflineError(result.error.message);
  }
  throw new BridgeError(result.error.code, result.error.message);
}

function unwrapSessions(data: BridgeSession[]): WaSession[] {
  return data.map(s => ({
    id: s.id,
    accountId: s.accountId,
    name: s.name,
    phone: s.phone,
    isConnected: s.isConnected,
  }));
}

function unwrapConversations(data: BridgeConversation[]): WaConversation[] {
  return data.map(c => ({
    id: c.id,
    phone: c.phone,
    name: c.name,
    lastMessage: c.lastMessage,
    lastMessageAt: c.lastMessageAt,
    unreadCount: c.unreadCount,
    status: c.status,
  }));
}

function unwrapMessages(data: BridgeMessage[]): WaMessage[] {
  return data.map(m => ({
    id: m.id,
    fromMe: m.fromMe,
    body: m.body,
    timestamp: m.timestamp,
    status: m.status,
  }));
}

function unwrapStats(data: BridgeAccountStats): AccountStats {
  return { ...data };
}

// ── 公开 API ──

export async function getSessions(): Promise<WaSession[]> {
  return unwrapSessions(unwrap(await localWhatsappBridge.getSessions()));
}

export async function getConversations(accountId: string): Promise<WaConversation[]> {
  const list = unwrapConversations(unwrap(await localWhatsappBridge.getConversations(accountId)));
  return list.sort((a, b) => {
    const w = statusSortWeight(a.status) - statusSortWeight(b.status);
    if (w !== 0) return w;
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });
}

export async function getMessages(accountId: string, phone: string): Promise<WaMessage[]> {
  return unwrapMessages(unwrap(await localWhatsappBridge.getMessages(accountId, phone)));
}

export async function sendMessage(payload: SendPayload): Promise<WaMessage> {
  const m = unwrap(await localWhatsappBridge.sendMessage(payload));
  return {
    id: m.id,
    fromMe: m.fromMe,
    body: m.body,
    timestamp: m.timestamp,
    status: m.status,
  };
}

export async function markAsRead(accountId: string, phone: string): Promise<void> {
  unwrap(await localWhatsappBridge.markAsRead(accountId, phone));
}

export async function updateConversationStatus(
  accountId: string, phone: string, status: ConversationStatus,
): Promise<void> {
  unwrap(await localWhatsappBridge.updateConversationStatus(accountId, phone, status));
}

export async function getAccountStats(accountId: string): Promise<AccountStats> {
  return unwrapStats(unwrap(await localWhatsappBridge.getAccountStats(accountId)));
}

/**
 * 检测 Companion 是否在线 + 模式 + worker 信息
 */
export async function checkCompanionHealth(): Promise<{
  online: boolean;
  mode?: string;
  isDemo?: boolean;
  sessionsConnected?: number;
  workersRunning?: number;
}> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    const res = await fetch('http://localhost:3100/health', { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return { online: false };
    const json = await res.json() as {
      success: boolean;
      data: {
        mode?: string;
        isDemo?: boolean;
        sessionsConnected?: number;
        workersRunning?: number;
      };
    };
    if (json.success) {
      return {
        online: true,
        mode: json.data.mode,
        isDemo: json.data.isDemo,
        sessionsConnected: json.data.sessionsConnected,
        workersRunning: json.data.workersRunning,
      };
    }
    return { online: true };
  } catch {
    return { online: false };
  }
}

export async function addSession(
  displayName: string,
  proxyUrl?: string,
): Promise<{ sessionId: string }> {
  return unwrap(await localWhatsappBridge.addSession(displayName, proxyUrl));
}

export async function getSessionQr(
  sessionId: string,
): Promise<{ state: string; qrDataUrl: string | null }> {
  return unwrap(await localWhatsappBridge.getSessionQr(sessionId));
}

export async function deleteSession(sessionId: string): Promise<void> {
  unwrap(await localWhatsappBridge.deleteSession(sessionId));
}

export async function getAllAccountStats(): Promise<Record<string, AccountStats>> {
  const sessions = unwrap(await localWhatsappBridge.getSessions());
  const result: Record<string, AccountStats> = {};
  for (const s of sessions) {
    const statResult = await localWhatsappBridge.getAccountStats(s.accountId);
    if (statResult.success) result[s.accountId] = unwrapStats(statResult.data);
  }
  return result;
}
