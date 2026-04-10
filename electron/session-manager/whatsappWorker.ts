/**
 * WhatsApp Worker Thread — 使用 @whiskeysockets/baileys
 *
 * 纯 Node.js WhatsApp 多设备协议，无需 Chrome/Puppeteer。
 * 在 Worker Thread 中运行，通过 parentPort 与主线程通信。
 * 支持 HTTP 代理（国内/受限网络用）。
 */

import { workerData, parentPort } from 'node:worker_threads';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import QRCode from 'qrcode';

// 用 createRequire 强制以 CJS 方式导入 baileys（避免 ESM 包装层导致的函数丢失）
const require = createRequire(import.meta.url);

type WorkerData = {
  sessionId: string;
  displayName: string;
  dataPath: string;
  proxyUrl?: string;  // 可选 HTTP 代理，如 http://127.0.0.1:7890
};

async function run() {
  const { sessionId, dataPath, proxyUrl } = workerData as WorkerData;

  if (!parentPort) {
    console.error('[Worker] No parentPort');
    process.exit(1);
  }
  const port = parentPort;
  const send = (msg: Record<string, unknown>) => port.postMessage(msg);

  try {
    // 用 require (CJS) 导入 baileys，避免 ESM 动态 import 包装层导致的命名导出问题
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const B = require('@whiskeysockets/baileys') as any;

    const makeWASocket: (...args: unknown[]) => unknown = B.makeWASocket ?? B.default?.makeWASocket;
    const useMultiFileAuthState: (path: string) => Promise<unknown> =
      B.useMultiFileAuthState ?? B.default?.useMultiFileAuthState;
    const DisconnectReason = B.DisconnectReason ?? B.default?.DisconnectReason ?? {};

    if (typeof makeWASocket !== 'function') {
      const keys = Object.keys(B).slice(0, 15).join(',');
      throw new Error(`makeWASocket not found. Keys: ${keys}`);
    }
    if (typeof useMultiFileAuthState !== 'function') {
      const keys = Object.keys(B).slice(0, 15).join(',');
      throw new Error(`useMultiFileAuthState not found. Keys: ${keys}`);
    }

    const authDir = join(dataPath, sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { state, saveCreds } = await useMultiFileAuthState(authDir) as any;

    // 构建 socket 配置
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const socketConfig: Record<string, any> = {
      auth: state,
      printQRInTerminal: false,
      connectTimeoutMs: 30_000,
      retryRequestDelayMs: 2_000,
      maxMsgRetryCount: 3,
      logger: {
        level: 'silent',
        trace: () => {}, debug: () => {}, info: () => {},
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        warn: (msg: any) => console.warn('[WA]', msg),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        error: (msg: any) => console.error('[WA]', msg),
        fatal: () => {},
        child: () => ({ trace: () => {}, debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {} }),
      },
    };

    // 配置代理（国内网络用）
    if (proxyUrl) {
      console.log(`[Worker] Using proxy: ${proxyUrl}`);
      try {
        // 使用 https-proxy-agent 或 node-fetch with proxy
        // baileys 支持通过 agent 参数设置代理
        const { HttpsProxyAgent } = await import('https-proxy-agent').catch(() => ({ HttpsProxyAgent: null }));
        if (HttpsProxyAgent) {
          socketConfig.agent = new HttpsProxyAgent(proxyUrl);
          console.log(`[Worker] Proxy agent configured: ${proxyUrl}`);
        } else {
          // 设置环境变量作为 fallback
          process.env.HTTPS_PROXY = proxyUrl;
          process.env.HTTP_PROXY = proxyUrl;
          console.log(`[Worker] Proxy via env vars: ${proxyUrl}`);
        }
      } catch (e) {
        console.warn(`[Worker] Failed to set proxy:`, e);
        // fallback: 设置环境变量
        process.env.HTTPS_PROXY = proxyUrl;
        process.env.HTTP_PROXY = proxyUrl;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sock = makeWASocket(socketConfig) as any;

    sock.ev.on('connection.update', async (update: Record<string, unknown>) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr as string, { width: 300, margin: 2 });
          send({ type: 'qr', sessionId, qrDataUrl });
          console.log(`[Worker] QR generated for session ${sessionId}`);
        } catch (err) {
          send({ type: 'error', sessionId, message: `QR generation failed: ${err}` });
        }
      }

      if (connection === 'open') {
        const phone = (sock.user?.id as string)?.split(':')[0] ?? '';
        const displayName = (sock.user?.name as string) ?? '';
        send({ type: 'ready', sessionId, phone, displayName });
        console.log(`[Worker] Session ${sessionId} connected: ${phone}`);
      }

      if (connection === 'close') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const statusCode = (lastDisconnect as any)?.error?.output?.statusCode;
        const loggedOut = statusCode === (DisconnectReason as Record<string, unknown>).loggedOut;
        const reason = loggedOut ? 'logged_out'
          : statusCode === 401 ? 'unauthorized'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : String((lastDisconnect as any)?.error?.message ?? 'closed');
        send({ type: 'disconnected', sessionId, reason });
        console.log(`[Worker] Session ${sessionId} disconnected: ${reason}`);
      }
    });

    sock.ev.on('creds.update', saveCreds);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    send({ type: 'error', sessionId, message });
    console.error('[Worker] Fatal error:', message);
  }
}

run();
