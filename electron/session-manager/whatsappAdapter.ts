/**
 * WhatsApp 真实适配器（Worker Thread 版）
 *
 * 使用 Node.js Worker Thread 运行 whatsapp-web.js，
 * 避免 Puppeteer/Chrome 初始化阻塞主进程事件循环。
 *
 * 依赖：
 *   npm install whatsapp-web.js qrcode
 *   npm install -D @types/qrcode
 */

import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  IWhatsAppAdapter,
  AdapterSession,
  AdapterConversation,
  AdapterMessage,
  AdapterStats,
  AdapterSendPayload,
} from './adapterInterface.js';

// ── Worker Thread 消息类型 ──

interface WorkerMessage {
  type: 'qr' | 'authenticated' | 'ready' | 'disconnected' | 'error';
  sessionId: string;
  qrDataUrl?: string;
  phone?: string;
  displayName?: string;
  reason?: string;
  message?: string;
}

// ── Chrome 路径搜索 ──

const CHROME_PATHS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') : '',
].filter(Boolean);

function findChrome(): string | undefined {
  for (const p of CHROME_PATHS) {
    if (p && existsSync(p)) return p;
  }
  return undefined;
}

// ── 会话条目 ──

interface SessionEntry {
  id: string;
  displayName: string;
  phone: string;
  state: 'initializing' | 'qr_pending' | 'authenticated' | 'connected' | 'disconnected' | 'destroyed';
  worker: Worker | null;
  qrDataUrl: string | null;
  qrTimestamp: number;
  createdAt: string;
}

// ── Worker 脚本路径 ──
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKER_PATH = join(__dirname, 'whatsappWorker.ts');

export class WhatsAppAdapter implements IWhatsAppAdapter {
  private sessions = new Map<string, SessionEntry>();
  private dataPath: string;

  private constructor(dataPath: string) {
    this.dataPath = dataPath;
  }

  /** 验证依赖可以被加载 */
  static async create(dataPath = './.wwebjs_data'): Promise<WhatsAppAdapter> {
    // 验证 baileys
    await import('@whiskeysockets/baileys');
    await import('qrcode');
    // 验证 Worker 脚本存在
    if (!existsSync(WORKER_PATH)) {
      throw new Error(`Worker script not found: ${WORKER_PATH}`);
    }
    return new WhatsAppAdapter(dataPath);
  }

  getSessions(): AdapterSession[] {
    return Array.from(this.sessions.values()).map(e => ({
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

    const entry: SessionEntry = {
      id: sessionId,
      displayName,
      phone: '',
      state: 'initializing',
      worker: null,
      qrDataUrl: null,
      qrTimestamp: 0,
      createdAt: new Date().toISOString(),
    };
    this.sessions.set(sessionId, entry);

    // 在 Worker Thread 中启动 WhatsApp 客户端（不阻塞主线程）
    const chromePath = findChrome();
    const worker = new Worker(WORKER_PATH, {
      workerData: { sessionId, displayName, dataPath: this.dataPath, chromePath, proxyUrl },
    });
    entry.worker = worker;

    worker.on('message', (msg: WorkerMessage) => {
      const e = this.sessions.get(msg.sessionId);
      if (!e) return;

      switch (msg.type) {
        case 'qr':
          e.qrDataUrl = msg.qrDataUrl ?? null;
          e.qrTimestamp = Date.now();
          e.state = 'qr_pending';
          console.log(`[WhatsApp] QR ready for session ${sessionId}`);
          break;
        case 'authenticated':
          e.state = 'authenticated';
          console.log(`[WhatsApp] Session ${sessionId} authenticated`);
          break;
        case 'ready':
          e.state = 'connected';
          if (msg.phone) e.phone = msg.phone;
          if (msg.displayName) e.displayName = msg.displayName;
          console.log(`[WhatsApp] Session ${sessionId} connected (${e.phone})`);
          break;
        case 'disconnected':
          e.state = 'disconnected';
          console.log(`[WhatsApp] Session ${sessionId} disconnected: ${msg.reason}`);
          break;
        case 'error':
          e.state = 'disconnected';
          console.error(`[WhatsApp] Session ${sessionId} error: ${msg.message}`);
          break;
      }
    });

    worker.on('error', (err) => {
      console.error(`[WhatsApp] Worker error for ${sessionId}:`, err.message);
      entry.state = 'disconnected';
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.warn(`[WhatsApp] Worker for ${sessionId} exited with code ${code}`);
        if (entry.state !== 'connected' && entry.state !== 'destroyed') {
          entry.state = 'disconnected';
        }
      }
    });

    return { sessionId };
  }

  async getSessionQr(sessionId: string): Promise<{ state: string; qrDataUrl: string | null } | null> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;
    const QR_TTL = 60_000;
    const qrValid = entry.qrDataUrl && (Date.now() - entry.qrTimestamp) < QR_TTL;
    return { state: entry.state, qrDataUrl: qrValid ? entry.qrDataUrl : null };
  }

  async removeSession(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    entry.state = 'destroyed';
    if (entry.worker) {
      try { await entry.worker.terminate(); } catch { /* ignore */ }
    }
    this.sessions.delete(sessionId);
  }

  async getConversations(accountId: string): Promise<AdapterConversation[]> {
    // Worker Thread 不暴露实时会话数据，返回空（需要通过 WebSocket 或轮询实现）
    void accountId;
    return [];
  }

  async getMessages(accountId: string, phone: string): Promise<AdapterMessage[]> {
    void accountId; void phone;
    return [];
  }

  async sendMessage(payload: AdapterSendPayload): Promise<AdapterMessage> {
    throw new Error(`Session ${payload.accountId} does not support direct message send in worker mode`);
  }

  async markAsRead(_accountId: string, _phone: string): Promise<void> { /* noop */ }

  async updateStatus(_accountId: string, _phone: string, _status: string): Promise<void> { /* noop */ }

  async getStats(accountId: string): Promise<AdapterStats> {
    void accountId;
    return { totalConversations: 0, unreadCount: 0, readNoReplyCount: 0, followUpCount: 0, priorityCount: 0 };
  }

  async destroy(): Promise<void> {
    const ids = Array.from(this.sessions.keys());
    for (const id of ids) await this.removeSession(id);
  }
}
