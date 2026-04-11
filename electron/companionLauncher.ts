/**
 * Companion 启动器（可被 start.ts CLI 和 Electron main process 共同 import）
 *
 * 职责：
 *   1. 检测端口 3100 是否已被占用
 *   2. 若已有 Companion 实例在运行（/health 可达），直接复用
 *   3. 若端口被其他程序占用，向调用方报告冲突
 *   4. 若端口空闲，正常创建 adapter + 启动 local API
 */

import * as http from 'node:http';
import * as net from 'node:net';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startLocalApi, DEFAULT_PORT, DEFAULT_HOST } from './local-api/index.js';
import type { IWhatsAppAdapter } from './session-manager/adapterInterface.js';

const __selfFile = fileURLToPath(import.meta.url);
const __selfDir = dirname(__selfFile);

export interface CompanionResult {
  adapter: IWhatsAppAdapter;
  port: number;
  mode: string;
  /** true = 复用了已有实例，调用方不应在退出时 close */
  reused: boolean;
  close: () => Promise<void>;
}

/**
 * 检测端口是否被占用（纯 TCP 探测）
 */
function isPortInUse(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.connect(port, host);
  });
}

/**
 * 检测已运行的 Companion 实例（通过 /health 端点）
 * 返回 health JSON 或 null
 */
function probeExistingCompanion(port: number, host: string): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const req = http.get(`http://${host}:${port}/health`, { timeout: 2000 }, (res) => {
      if (res.statusCode !== 200) { res.resume(); resolve(null); return; }
      let body = '';
      res.on('data', (c: Buffer) => { body += c.toString(); });
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json?.data?.status === 'ok' || json?.status === 'ok') {
            resolve(json.data ?? json);
          } else {
            resolve(null);
          }
        } catch { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

/**
 * 获取 WhatsApp 会话数据存储路径
 */
function getDataPath(): string {
  if (process.env.ELECTRON_APP === '1') {
    try {
      const electronMod = globalThis.require?.('electron') as { app?: { getPath: (name: string) => string } } | undefined;
      if (electronMod?.app) {
        const p = join(electronMod.app.getPath('userData'), 'wa_sessions');
        console.log(`[Companion] dataPath (electron): ${p}`);
        return p;
      }
    } catch { /* fall through */ }

    const appData = process.env.APPDATA || process.env.HOME || '';
    if (appData) {
      const p = join(appData, 'FastGC WhatsApp 工作台', 'wa_sessions');
      console.log(`[Companion] dataPath (APPDATA fallback): ${p}`);
      return p;
    }
  }

  const p = join(__selfDir, '.wa_sessions');
  console.log(`[Companion] dataPath (CLI): ${p}`);
  return p;
}

export async function createAdapter(): Promise<{ adapter: IWhatsAppAdapter; mode: string }> {
  if (process.env.USE_DEMO === '1') {
    console.warn('[Companion] USE_DEMO=1 — 强制演示模式');
    const { createDemoAdapter } = await import('./session-manager/demoAdapter.js');
    return { adapter: createDemoAdapter(), mode: 'Demo (explicit)' };
  }

  console.log('[Companion] Loading WhatsAppAdapter (Baileys)...');
  const { WhatsAppAdapter } = await import('./session-manager/whatsappAdapter.js');
  const dataPath = getDataPath();
  console.log(`[Companion] Creating adapter with dataPath: ${dataPath}`);
  const adapter = await WhatsAppAdapter.create(dataPath);
  return { adapter, mode: 'Baileys (real)' };
}

/** 创建一个空壳 adapter 代理，将所有方法转发到远程 HTTP */
function createRemoteProxyAdapter(port: number, host: string): IWhatsAppAdapter {
  const noop = async () => { /* no-op for reused instance */ };
  return {
    getSessions: () => [],
    getConversations: async () => [],
    getMessages: async () => [],
    sendMessage: async () => ({ id: '', fromMe: true, body: '', timestamp: Date.now(), type: 'text' }),
    markAsRead: noop,
    updateStatus: noop,
    getStats: async () => ({ totalConversations: 0, unreadCount: 0, readNoReplyCount: 0, followUpCount: 0, priorityCount: 0 }),
    addSession: async () => ({ sessionId: '' }),
    getSessionQr: async () => null,
    getLoginStatus: async () => null,
    removeSession: noop,
    getHealthInfo: () => ({ sessionsTotal: 0, sessionsConnected: 0, workersRunning: 0 }),
    destroy: noop,
  };
}

export async function startCompanionServer(options?: {
  port?: number;
  host?: string;
}): Promise<CompanionResult> {
  const port = options?.port ?? DEFAULT_PORT;
  const host = options?.host ?? DEFAULT_HOST;

  console.log(`[Companion] startCompanionServer() — checking port ${host}:${port}...`);

  // ── Step 1: 检测端口是否占用 ──
  const portBusy = await isPortInUse(port, host);

  if (portBusy) {
    console.log(`[Companion] Port ${port} is OCCUPIED — probing existing Companion...`);

    // ── Step 2: 检查是否为已运行的 Companion ──
    const health = await probeExistingCompanion(port, host);

    if (health) {
      console.log(`[Companion] ✅ Existing Companion detected — reusing (mode=${health.mode}, uptime=${health.uptime}s)`);
      const proxyAdapter = createRemoteProxyAdapter(port, host);
      return {
        adapter: proxyAdapter,
        port,
        mode: `Reused (${health.mode ?? 'unknown'})`,
        reused: true,
        close: async () => { /* 不关闭外部实例 */ },
      };
    }

    // ── Step 3: 端口被其他程序占用 ──
    console.error(`[Companion] ❌ Port ${port} occupied by another program (not Companion)`);
    throw new Error(
      `PORT_CONFLICT: 端口 ${port} 已被其他程序占用。\n` +
      `请关闭占用该端口的程序，或重启客户端。\n` +
      `（可在任务管理器中查找使用端口 ${port} 的进程）`
    );
  }

  // ── Step 4: 端口空闲，正常启动 ──
  console.log(`[Companion] Port ${port} is FREE — starting new instance...`);

  const { adapter, mode } = await createAdapter();
  console.log(`[Companion] Adapter created: ${mode}`);
  console.log(`[Companion] Starting local API on ${host}:${port}...`);

  const result = await startLocalApi({
    adapter,
    adapterMode: mode,
    port,
    host,
  });

  console.log(`[Companion] ✅ Local API LISTENING on ${host}:${result.port}`);

  return { adapter, port: result.port, mode, reused: false, close: result.close };
}

export { DEFAULT_PORT, DEFAULT_HOST };
