/**
 * WhatsApp 真实适配器（Worker Thread 版）
 *
 * 功能：
 *   - 通过 Worker Thread 运行 Baileys，避免阻塞主线程
 *   - 消息收发：messages.upsert / send_message
 *   - 联系人同步：contacts.upsert
 *   - 历史消息导入：receivedPendingNotifications
 *   - 消息持久化：通过 SessionStore (JSON 文件)
 *   - Worker 异常退出自动重启（最多 3 次）
 *   - 多账号隔离：每个 session 独立 Worker + 独立存储目录
 */

import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SessionStore, jidToPhone } from '../store/messageStore.js';
import type {
  IWhatsAppAdapter,
  AdapterSession,
  AdapterConversation,
  AdapterMessage,
  AdapterStats,
  AdapterSendPayload,
} from './adapterInterface.js';

// ── Worker 消息类型 ──

interface WorkerMsg {
  type: string;
  sessionId: string;
  [key: string]: unknown;
}

type SessionState = 'initializing' | 'qr_pending' | 'scanned' | 'authenticated' | 'connected' | 'disconnected' | 'error' | 'destroyed';

interface SessionEntry {
  id: string;
  displayName: string;
  phone: string;
  proxyUrl?: string;
  state: SessionState;
  worker: Worker | null;
  store: SessionStore;
  qrDataUrl: string | null;
  qrTimestamp: number;
  qrIndex: number;
  errorMessage: string | null;
  createdAt: string;
  restartCount: number;
  pendingSends: Map<string, { resolve: (v: AdapterMessage) => void; reject: (e: Error) => void }>;
}

const MAX_RESTART = 3;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKER_PATH = join(__dirname, 'whatsappWorker.ts');

export class WhatsAppAdapter implements IWhatsAppAdapter {
  private sessions = new Map<string, SessionEntry>();
  private dataPath: string;

  private constructor(dataPath: string) {
    this.dataPath = dataPath;
  }

  static async create(dataPath = './.wa_sessions'): Promise<WhatsAppAdapter> {
    await import('@whiskeysockets/baileys');
    await import('qrcode');
    if (!existsSync(WORKER_PATH)) {
      throw new Error(`Worker script not found: ${WORKER_PATH}`);
    }
    return new WhatsAppAdapter(dataPath);
  }

  // ── Session 管理 ──

  getSessions(): AdapterSession[] {
    return Array.from(this.sessions.values())
      .filter(e => e.state !== 'destroyed')
      .map(e => ({
        id: e.id,
        accountId: e.id,
        name: e.displayName,
        phone: e.phone,
        isConnected: e.state === 'connected',
        state: e.state,
      }));
  }

  async addSession(displayName: string, proxyUrl?: string): Promise<{ sessionId: string }> {
    const sessionId = randomUUID();
    const store = new SessionStore(this.dataPath, sessionId);

    const entry: SessionEntry = {
      id: sessionId,
      displayName,
      phone: '',
      proxyUrl,
      state: 'initializing',
      worker: null,
      store,
      qrDataUrl: null,
      qrTimestamp: 0,
      qrIndex: 0,
      errorMessage: null,
      createdAt: new Date().toISOString(),
      restartCount: 0,
      pendingSends: new Map(),
    };
    this.sessions.set(sessionId, entry);
    this.spawnWorker(entry);
    return { sessionId };
  }

  private spawnWorker(entry: SessionEntry) {
    const { id: sessionId } = entry;

    const worker = new Worker(WORKER_PATH, {
      workerData: { sessionId, displayName: entry.displayName, dataPath: this.dataPath, proxyUrl: entry.proxyUrl },
    });
    entry.worker = worker;

    worker.on('message', (msg: WorkerMsg) => this.handleWorkerMessage(entry, msg));

    worker.on('error', (err) => {
      console.error(`[WhatsApp] Worker error ${sessionId.slice(0, 8)}:`, err.message);
      if (entry.state !== 'destroyed') {
        entry.state = 'error';
        entry.errorMessage = err.message;
      }
    });

    worker.on('exit', (code) => {
      if (entry.state === 'destroyed') return;

      // 已连接但 worker 意外退出 → 自动重启
      if (entry.state === 'connected' && entry.restartCount < MAX_RESTART) {
        entry.restartCount++;
        console.warn(`[WhatsApp] ${sessionId.slice(0, 8)} worker crashed (exit ${code}), restarting (${entry.restartCount}/${MAX_RESTART})...`);
        entry.state = 'disconnected';
        entry.worker = null;
        setTimeout(() => {
          if (entry.state !== 'destroyed') this.spawnWorker(entry);
        }, 2000 * entry.restartCount);
        return;
      }

      if (code !== 0 && entry.state !== 'connected') {
        entry.state = 'error';
        entry.errorMessage = `Worker exited with code ${code}`;
      }
    });
  }

  private handleWorkerMessage(entry: SessionEntry, msg: WorkerMsg) {
    if (entry.state === 'destroyed') return;
    const sid = entry.id.slice(0, 8);

    switch (msg.type) {
      case 'qr':
        entry.qrDataUrl = (msg.qrDataUrl as string) ?? null;
        entry.qrTimestamp = Date.now();
        entry.qrIndex = (msg.qrIndex as number) ?? (entry.qrIndex + 1);
        entry.state = 'qr_pending';
        entry.errorMessage = null;
        console.log(`[WA] QR #${entry.qrIndex} for ${sid}`);
        break;

      case 'scanned':
        entry.state = 'scanned';
        break;

      case 'authenticated':
        entry.state = 'authenticated';
        break;

      case 'ready':
        entry.state = 'connected';
        entry.restartCount = 0;
        if (msg.phone) entry.phone = msg.phone as string;
        if (msg.displayName) entry.displayName = msg.displayName as string;
        console.log(`[WA] ${sid} connected (${entry.phone})`);
        break;

      case 'disconnected':
        entry.state = 'disconnected';
        entry.errorMessage = (msg.reason as string) ?? 'disconnected';
        // shouldReconnect 由 worker 判断（非登出/非授权失败）
        if (msg.shouldReconnect && entry.restartCount < MAX_RESTART) {
          entry.restartCount++;
          console.log(`[WA] ${sid} will reconnect (${entry.restartCount}/${MAX_RESTART})...`);
          setTimeout(() => {
            if (entry.state !== 'destroyed') {
              entry.state = 'initializing';
              this.spawnWorker(entry);
            }
          }, 3000 * entry.restartCount);
        }
        break;

      case 'error':
        entry.state = 'error';
        entry.errorMessage = (msg.message as string) ?? 'unknown error';
        break;

      case 'contacts_upsert':
        entry.store.upsertContacts(msg.contacts as Array<{ id: string; name?: string; notify?: string }>);
        break;

      case 'message_upsert':
        this.handleMessageUpsert(entry, msg);
        break;

      case 'message_status':
        // 消息送达/已读状态更新（后续可扩展 UI 标记）
        break;

      case 'history_sync_complete':
        console.log(`[WA] ${sid} history sync complete`);
        break;

      case 'send_result':
        this.handleSendResult(entry, msg);
        break;
    }
  }

  private handleMessageUpsert(entry: SessionEntry, msg: WorkerMsg) {
    const messages = msg.messages as Array<{
      id: string; remoteJid: string; fromMe: boolean; body: string;
      timestamp: number; type: string; pushName?: string;
    }>;

    for (const m of messages) {
      // 持久化消息
      entry.store.appendMessage(m.remoteJid, {
        id: m.id,
        fromMe: m.fromMe,
        body: m.body,
        timestamp: m.timestamp,
        type: m.type,
        status: m.fromMe ? 'sent' : undefined,
        remoteJid: m.remoteJid,
      });

      // 更新联系人名称（来自 pushName）
      if (m.pushName && !m.fromMe) {
        entry.store.upsertContacts([{ id: m.remoteJid, notify: m.pushName }]);
      }

      // 更新会话
      entry.store.upsertConversation(m.remoteJid, {
        lastMessage: m.body || `[${m.type}]`,
        lastMessageAt: m.timestamp,
        name: entry.store.getContactName(m.remoteJid),
        ...(m.fromMe
          ? { status: 'replied' }
          : { unreadCount: (entry.store.getConversations().find(c => c.jid === m.remoteJid)?.unreadCount ?? 0) + 1, status: 'unread' }
        ),
      });
    }
  }

  private handleSendResult(entry: SessionEntry, msg: WorkerMsg) {
    const requestId = msg.requestId as string;
    const pending = entry.pendingSends.get(requestId);
    if (!pending) return;
    entry.pendingSends.delete(requestId);

    if (msg.success) {
      pending.resolve({
        id: (msg.messageId as string) || requestId,
        fromMe: true,
        body: '',
        timestamp: (msg.timestamp as number) || Date.now(),
        type: 'text',
        status: 'sent',
      });
    } else {
      pending.reject(new Error((msg.error as string) || 'Send failed'));
    }
  }

  // ── QR / Login Status ──

  async getSessionQr(sessionId: string): Promise<{ state: string; qrDataUrl: string | null } | null> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;
    return { state: entry.state, qrDataUrl: entry.qrDataUrl };
  }

  async getLoginStatus(sessionId: string): Promise<{
    state: string; phone: string | null; displayName: string | null; errorMessage: string | null;
  } | null> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;
    return {
      state: entry.state,
      phone: entry.phone || null,
      displayName: entry.displayName || null,
      errorMessage: entry.errorMessage,
    };
  }

  // ── 会话 / 消息 / 发送 ──

  async getConversations(accountId: string): Promise<AdapterConversation[]> {
    const entry = this.sessions.get(accountId);
    if (!entry) return [];
    return entry.store.getConversations().map(c => ({
      id: c.jid,
      phone: c.phone,
      name: c.name,
      lastMessage: c.lastMessage,
      lastMessageAt: c.lastMessageAt,
      unreadCount: c.unreadCount,
      status: c.status,
    }));
  }

  async getMessages(accountId: string, phone: string): Promise<AdapterMessage[]> {
    const entry = this.sessions.get(accountId);
    if (!entry) return [];
    // phone 可能带 @s.whatsapp.net，也可能不带
    const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
    return entry.store.getMessages(jid).map(m => ({
      id: m.id,
      fromMe: m.fromMe,
      body: m.body,
      timestamp: m.timestamp,
      type: m.type,
      status: m.status,
    }));
  }

  async sendMessage(payload: AdapterSendPayload): Promise<AdapterMessage> {
    const entry = this.sessions.get(payload.accountId);
    if (!entry || entry.state !== 'connected' || !entry.worker) {
      throw new Error('Session not connected');
    }

    const jid = payload.phone.includes('@') ? payload.phone : `${payload.phone}@s.whatsapp.net`;
    const requestId = randomUUID();

    return new Promise<AdapterMessage>((resolve, reject) => {
      entry.pendingSends.set(requestId, {
        resolve: (result) => {
          // 持久化已发送消息
          const msg = { ...result, body: payload.body, remoteJid: jid };
          entry.store.appendMessage(jid, msg);
          entry.store.upsertConversation(jid, {
            lastMessage: payload.body,
            lastMessageAt: result.timestamp,
            status: 'replied',
          });
          resolve(result);
        },
        reject,
      });

      // 10 秒超时
      setTimeout(() => {
        if (entry.pendingSends.has(requestId)) {
          entry.pendingSends.delete(requestId);
          reject(new Error('Send timeout'));
        }
      }, 10_000);

      entry.worker!.postMessage({ action: 'send_message', requestId, jid, text: payload.body });
    });
  }

  async markAsRead(accountId: string, phone: string): Promise<void> {
    const entry = this.sessions.get(accountId);
    if (!entry) return;
    const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
    entry.store.markConversationRead(jid);

    // 发送已读回执给 WhatsApp
    if (entry.worker && entry.state === 'connected') {
      const msgs = entry.store.getMessages(jid, 10);
      const unreadKeys = msgs
        .filter(m => !m.fromMe)
        .slice(-5)
        .map(m => ({ remoteJid: jid, id: m.id, fromMe: false }));
      if (unreadKeys.length > 0) {
        entry.worker.postMessage({ action: 'read_messages', keys: unreadKeys });
      }
    }
  }

  async updateStatus(accountId: string, phone: string, status: string): Promise<void> {
    const entry = this.sessions.get(accountId);
    if (!entry) return;
    const jid = phone.includes('@') ? phone : `${phone}@s.whatsapp.net`;
    entry.store.updateConversationStatus(jid, status);
  }

  async getStats(accountId: string): Promise<AdapterStats> {
    const entry = this.sessions.get(accountId);
    if (!entry) return { totalConversations: 0, unreadCount: 0, readNoReplyCount: 0, followUpCount: 0, priorityCount: 0 };
    return entry.store.getStats();
  }

  // ── 清理 ──

  async removeSession(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    entry.state = 'destroyed';
    // 拒绝所有待发送
    for (const [, p] of entry.pendingSends) p.reject(new Error('Session destroyed'));
    entry.pendingSends.clear();
    if (entry.worker) {
      try { await entry.worker.terminate(); } catch { /* ignore */ }
    }
    this.sessions.delete(sessionId);
  }

  async destroy(): Promise<void> {
    for (const id of Array.from(this.sessions.keys())) await this.removeSession(id);
  }
}
