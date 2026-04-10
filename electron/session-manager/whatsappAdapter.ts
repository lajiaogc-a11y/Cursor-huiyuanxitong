/**
 * WhatsApp 真实适配器（Worker Thread 版）
 *
 * 使用 @whiskeysockets/baileys 在 Worker Thread 中运行，
 * 避免阻塞主进程事件循环。
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

interface WorkerMessage {
  type: 'qr' | 'scanned' | 'authenticated' | 'ready' | 'disconnected' | 'error';
  sessionId: string;
  qrDataUrl?: string;
  qrIndex?: number;
  phone?: string;
  displayName?: string;
  reason?: string;
  message?: string;
}

type SessionState = 'initializing' | 'qr_pending' | 'scanned' | 'authenticated' | 'connected' | 'disconnected' | 'error' | 'destroyed';

interface SessionEntry {
  id: string;
  displayName: string;
  phone: string;
  state: SessionState;
  worker: Worker | null;
  qrDataUrl: string | null;
  qrTimestamp: number;
  qrIndex: number;
  errorMessage: string | null;
  createdAt: string;
}

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

    const entry: SessionEntry = {
      id: sessionId,
      displayName,
      phone: '',
      state: 'initializing',
      worker: null,
      qrDataUrl: null,
      qrTimestamp: 0,
      qrIndex: 0,
      errorMessage: null,
      createdAt: new Date().toISOString(),
    };
    this.sessions.set(sessionId, entry);

    const worker = new Worker(WORKER_PATH, {
      workerData: { sessionId, displayName, dataPath: this.dataPath, proxyUrl },
    });
    entry.worker = worker;

    worker.on('message', (msg: WorkerMessage) => {
      const e = this.sessions.get(msg.sessionId);
      if (!e || e.state === 'destroyed') return;

      switch (msg.type) {
        case 'qr':
          e.qrDataUrl = msg.qrDataUrl ?? null;
          e.qrTimestamp = Date.now();
          e.qrIndex = msg.qrIndex ?? (e.qrIndex + 1);
          e.state = 'qr_pending';
          e.errorMessage = null;
          console.log(`[WhatsApp] QR #${e.qrIndex} ready for ${sessionId.slice(0, 8)}`);
          break;
        case 'scanned':
          e.state = 'scanned';
          console.log(`[WhatsApp] ${sessionId.slice(0, 8)} scanned, waiting confirm`);
          break;
        case 'authenticated':
          e.state = 'authenticated';
          console.log(`[WhatsApp] ${sessionId.slice(0, 8)} authenticated`);
          break;
        case 'ready':
          e.state = 'connected';
          if (msg.phone) e.phone = msg.phone;
          if (msg.displayName) e.displayName = msg.displayName;
          console.log(`[WhatsApp] ${sessionId.slice(0, 8)} connected (${e.phone})`);
          break;
        case 'disconnected':
          e.state = 'disconnected';
          e.errorMessage = msg.reason ?? 'disconnected';
          console.log(`[WhatsApp] ${sessionId.slice(0, 8)} disconnected: ${msg.reason}`);
          break;
        case 'error':
          e.state = 'error';
          e.errorMessage = msg.message ?? 'unknown error';
          console.error(`[WhatsApp] ${sessionId.slice(0, 8)} error: ${msg.message}`);
          break;
      }
    });

    worker.on('error', (err) => {
      console.error(`[WhatsApp] Worker error for ${sessionId.slice(0, 8)}:`, err.message);
      entry.state = 'error';
      entry.errorMessage = err.message;
    });

    worker.on('exit', (code) => {
      if (code !== 0 && entry.state !== 'connected' && entry.state !== 'destroyed') {
        console.warn(`[WhatsApp] Worker for ${sessionId.slice(0, 8)} exited with code ${code}`);
        entry.state = 'error';
        entry.errorMessage = `Worker exited with code ${code}`;
      }
    });

    return { sessionId };
  }

  async getSessionQr(sessionId: string): Promise<{ state: string; qrDataUrl: string | null } | null> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return null;
    // QR 图片在 Baileys 自动刷新时由 worker 更新，这里始终返回最新的
    return { state: entry.state, qrDataUrl: entry.qrDataUrl };
  }

  async getLoginStatus(sessionId: string): Promise<{
    state: string;
    phone: string | null;
    displayName: string | null;
    errorMessage: string | null;
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

  async removeSession(sessionId: string): Promise<void> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    entry.state = 'destroyed';
    if (entry.worker) {
      try { await entry.worker.terminate(); } catch { /* ignore */ }
    }
    this.sessions.delete(sessionId);
  }

  async getConversations(_accountId: string): Promise<AdapterConversation[]> { return []; }
  async getMessages(_accountId: string, _phone: string): Promise<AdapterMessage[]> { return []; }
  async sendMessage(payload: AdapterSendPayload): Promise<AdapterMessage> {
    throw new Error(`Session ${payload.accountId} direct send not yet supported`);
  }
  async markAsRead(_accountId: string, _phone: string): Promise<void> { /* noop */ }
  async updateStatus(_accountId: string, _phone: string, _status: string): Promise<void> { /* noop */ }
  async getStats(_accountId: string): Promise<AdapterStats> {
    return { totalConversations: 0, unreadCount: 0, readNoReplyCount: 0, followUpCount: 0, priorityCount: 0 };
  }

  async destroy(): Promise<void> {
    for (const id of Array.from(this.sessions.keys())) await this.removeSession(id);
  }
}
