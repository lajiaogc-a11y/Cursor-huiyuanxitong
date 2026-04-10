/**
 * WhatsApp Worker Thread — @whiskeysockets/baileys
 *
 * 纯 Node.js WhatsApp 多设备协议，无需 Chrome/Puppeteer。
 * 在 Worker Thread 中运行，通过 parentPort 与主线程通信。
 *
 * 上报消息类型：
 *   qr           — QR 码就绪（可能多次刷新）
 *   scanned      — 用户已扫码，等待手机确认
 *   ready        — 登录成功，连接就绪
 *   disconnected — 断开连接
 *   error        — 致命错误
 */

import { workerData, parentPort } from 'node:worker_threads';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

type WorkerData = {
  sessionId: string;
  displayName: string;
  dataPath: string;
  proxyUrl?: string;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const B = require('@whiskeysockets/baileys') as any;

    const makeWASocket: (...args: unknown[]) => unknown = B.makeWASocket ?? B.default?.makeWASocket;
    const useMultiFileAuthState: (path: string) => Promise<unknown> =
      B.useMultiFileAuthState ?? B.default?.useMultiFileAuthState;
    const DisconnectReason = B.DisconnectReason ?? B.default?.DisconnectReason ?? {};
    const Browsers = B.Browsers ?? B.default?.Browsers;

    if (typeof makeWASocket !== 'function') {
      throw new Error(`makeWASocket not found. Keys: ${Object.keys(B).slice(0, 15).join(',')}`);
    }
    if (typeof useMultiFileAuthState !== 'function') {
      throw new Error(`useMultiFileAuthState not found. Keys: ${Object.keys(B).slice(0, 15).join(',')}`);
    }

    const authDir = join(dataPath, sessionId);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { state, saveCreds } = await useMultiFileAuthState(authDir) as any;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const socketConfig: Record<string, any> = {
      auth: state,
      printQRInTerminal: false,
      browser: Browsers ? Browsers.ubuntu('FastGC CRM') : ['FastGC CRM', 'Chrome', '120.0'],
      connectTimeoutMs: 60_000,
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

    // 代理配置
    const effectiveProxy = proxyUrl || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
    if (effectiveProxy) {
      console.log(`[Worker] Using proxy: ${effectiveProxy}`);
      try {
        const { HttpsProxyAgent } = await import('https-proxy-agent').catch(() => ({ HttpsProxyAgent: null }));
        if (HttpsProxyAgent) {
          socketConfig.agent = new HttpsProxyAgent(effectiveProxy);
        } else {
          process.env.HTTPS_PROXY = effectiveProxy;
          process.env.HTTP_PROXY = effectiveProxy;
        }
      } catch {
        process.env.HTTPS_PROXY = effectiveProxy;
        process.env.HTTP_PROXY = effectiveProxy;
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sock = makeWASocket(socketConfig) as any;
    let qrCount = 0;
    let hasAuthenticated = false;

    sock.ev.on('connection.update', async (update: Record<string, unknown>) => {
      const { connection, lastDisconnect, qr, receivedPendingNotifications } = update;

      // QR 码就绪（Baileys 会在过期后自动刷新，每次触发新 qr 事件）
      if (qr) {
        qrCount++;
        try {
          const QRCode = await import('qrcode');
          const qrDataUrl = await QRCode.default.toDataURL(qr as string, { width: 300, margin: 2 });
          send({ type: 'qr', sessionId, qrDataUrl, qrIndex: qrCount });
          console.log(`[Worker] QR #${qrCount} generated for session ${sessionId}`);
        } catch (err) {
          send({ type: 'error', sessionId, message: `QR generation failed: ${err}` });
        }
      }

      // 用户扫码后，Baileys 进入 connecting 状态
      if (connection === 'connecting' && hasAuthenticated) {
        send({ type: 'scanned', sessionId });
        console.log(`[Worker] Session ${sessionId} scanned, waiting confirmation...`);
      }

      // 连接成功
      if (connection === 'open') {
        hasAuthenticated = true;
        const phone = (sock.user?.id as string)?.split(':')[0] ?? '';
        const displayName = (sock.user?.name as string) ?? '';
        send({ type: 'ready', sessionId, phone, displayName });
        console.log(`[Worker] Session ${sessionId} connected: ${phone}`);
      }

      // 收到历史消息通知 — 标志完全就绪
      if (receivedPendingNotifications) {
        console.log(`[Worker] Session ${sessionId} fully synced`);
      }

      // 连接断开
      if (connection === 'close') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const statusCode = (lastDisconnect as any)?.error?.output?.statusCode;
        const loggedOut = statusCode === (DisconnectReason as Record<string, unknown>).loggedOut;
        const reason = loggedOut ? 'logged_out'
          : statusCode === 401 ? 'unauthorized'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : String((lastDisconnect as any)?.error?.message ?? 'closed');
        send({ type: 'disconnected', sessionId, reason });
        console.log(`[Worker] Session ${sessionId} disconnected: ${reason} (code: ${statusCode})`);
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
