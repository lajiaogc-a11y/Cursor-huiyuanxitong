/**
 * 本地会话桥接 Service
 *
 * Step 9 — 委派到 API Client（localWhatsappBridge）
 *
 * 职责：
 *   - 为页面层提供稳定的方法签名（getSessions / getConversations / …）
 *   - 调用 API Client（localWhatsappBridge）获取数据
 *   - API Client 内部自动检测 companion 是否在线：
 *       在线 → 真实 HTTP 请求 localhost:3100
 *       离线 → 内存 mock fallback
 *   - 在本层添加排序等纯业务逻辑
 * 规则：
 *   - 不直接发后端请求，不操作 DOM
 *   - 上层页面只消费本模块导出，无需关心数据来源
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
} from '@/api/localWhatsappBridge';

// ── 类型（与 API Client 保持兼容，页面层通过本模块导入） ──

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

// ── 内部工具：BridgeResult → 业务类型 ──

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

// ── 公开 API（方法签名与 Phase 2 完全一致，页面层零改动） ──

export async function getSessions(): Promise<WaSession[]> {
  const result = await localWhatsappBridge.getSessions();
  if (!result.success) return [];
  return unwrapSessions(result.data);
}

export async function getConversations(accountId: string): Promise<WaConversation[]> {
  const result = await localWhatsappBridge.getConversations(accountId);
  if (!result.success) return [];
  const list = unwrapConversations(result.data);
  return list.sort((a, b) => {
    const w = statusSortWeight(a.status) - statusSortWeight(b.status);
    if (w !== 0) return w;
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
  });
}

export async function getMessages(accountId: string, phone: string): Promise<WaMessage[]> {
  const result = await localWhatsappBridge.getMessages(accountId, phone);
  if (!result.success) return [];
  return unwrapMessages(result.data);
}

export async function sendMessage(payload: SendPayload): Promise<WaMessage> {
  const result = await localWhatsappBridge.sendMessage(payload);
  if (!result.success) throw new Error(result.error.message);
  return {
    id: result.data.id,
    fromMe: result.data.fromMe,
    body: result.data.body,
    timestamp: result.data.timestamp,
    status: result.data.status,
  };
}

/** 标记会话为已读（bridge 会把 unread → read_no_reply） */
export async function markAsRead(accountId: string, phone: string): Promise<void> {
  await localWhatsappBridge.markAsRead(accountId, phone);
}

/** 同步更新会话列表中的状态 */
export async function updateConversationStatus(
  accountId: string, phone: string, status: ConversationStatus,
): Promise<void> {
  await localWhatsappBridge.updateConversationStatus(accountId, phone, status);
}

/** 获取指定账号的会话统计 */
export async function getAccountStats(accountId: string): Promise<AccountStats> {
  const result = await localWhatsappBridge.getAccountStats(accountId);
  if (!result.success) return { totalConversations: 0, unreadCount: 0, readNoReplyCount: 0, followUpCount: 0, priorityCount: 0 };
  return unwrapStats(result.data);
}

/**
 * 检测 Companion 是否在线（localhost:3100）
 */
export async function checkCompanionOnline(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:3100/health', { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 添加新 WhatsApp 账号（触发 QR 扫码流程）
 * companion 离线时返回 null（不生成假数据）
 */
export async function addSession(
  displayName: string,
  proxyUrl?: string,
): Promise<{ sessionId: string } | null> {
  const result = await localWhatsappBridge.addSession(displayName, proxyUrl);
  if (!result.success) {
    console.error('[BridgeService] addSession failed:', result.error.message);
    return null;
  }
  return result.data;
}

/**
 * 查询扫码状态（轮询用）
 * companion 离线时返回 null（不生成假二维码）
 */
export async function getSessionQr(
  sessionId: string,
): Promise<{ state: string; qrDataUrl: string | null } | null> {
  const result = await localWhatsappBridge.getSessionQr(sessionId);
  if (!result.success) return null;
  return result.data;
}

/**
 * 删除账号（断开并从列表移除）
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await localWhatsappBridge.deleteSession(sessionId);
}

/** 获取所有账号的聚合统计（用于账号列表 badge） */
export async function getAllAccountStats(): Promise<Record<string, AccountStats>> {
  const sessResult = await localWhatsappBridge.getSessions();
  if (!sessResult.success) return {};
  const result: Record<string, AccountStats> = {};
  for (const s of sessResult.data) {
    const statResult = await localWhatsappBridge.getAccountStats(s.accountId);
    if (statResult.success) result[s.accountId] = unwrapStats(statResult.data);
  }
  return result;
}
