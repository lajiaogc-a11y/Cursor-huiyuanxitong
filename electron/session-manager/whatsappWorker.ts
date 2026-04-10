/**
 * WhatsApp Worker Thread — @whiskeysockets/baileys
 *
 * 在 Worker Thread 中运行，通过 parentPort 与主线程通信。
 *
 * 上报消息类型（→ 主线程）：
 *   qr / scanned / ready / disconnected / error
 *   message_upsert   — 新消息 / 历史消息
 *   contacts_upsert  — 联系人同步
 *   message_status   — 消息状态更新（已送达/已读）
 *
 * 接收命令（← 主线程）：
 *   send_message      — 发送文本消息
 *   read_messages      — 标记已读
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

    // ── 连接状态事件 ──

    sock.ev.on('connection.update', async (update: Record<string, unknown>) => {
      const { connection, lastDisconnect, qr, receivedPendingNotifications } = update;

      if (qr) {
        qrCount++;
        try {
          const QRCode = await import('qrcode');
          const qrDataUrl = await QRCode.default.toDataURL(qr as string, { width: 300, margin: 2 });
          send({ type: 'qr', sessionId, qrDataUrl, qrIndex: qrCount });
        } catch (err) {
          send({ type: 'error', sessionId, message: `QR generation failed: ${err}` });
        }
      }

      if (connection === 'connecting' && hasAuthenticated) {
        send({ type: 'scanned', sessionId });
      }

      if (connection === 'open') {
        hasAuthenticated = true;
        const phone = (sock.user?.id as string)?.split(':')[0] ?? '';
        const displayName = (sock.user?.name as string) ?? '';
        send({ type: 'ready', sessionId, phone, displayName });
        console.log(`[Worker] ${sessionId.slice(0, 8)} connected: ${phone}`);
      }

      if (receivedPendingNotifications) {
        send({ type: 'history_sync_complete', sessionId });
        console.log(`[Worker] ${sessionId.slice(0, 8)} history sync complete`);
      }

      if (connection === 'close') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const statusCode = (lastDisconnect as any)?.error?.output?.statusCode;
        const loggedOut = statusCode === (DisconnectReason as Record<string, unknown>).loggedOut;
        const reason = loggedOut ? 'logged_out'
          : statusCode === 401 ? 'unauthorized'
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          : String((lastDisconnect as any)?.error?.message ?? 'closed');
        send({ type: 'disconnected', sessionId, reason, shouldReconnect: !loggedOut && statusCode !== 401 });
        console.log(`[Worker] ${sessionId.slice(0, 8)} disconnected: ${reason}`);
      }
    });

    sock.ev.on('creds.update', saveCreds);

    // ── 联系人同步 ──

    sock.ev.on('contacts.upsert', (contacts: Array<{ id: string; name?: string; notify?: string }>) => {
      if (contacts.length === 0) return;
      send({
        type: 'contacts_upsert',
        sessionId,
        contacts: contacts.map((c: { id: string; name?: string; notify?: string }) => ({
          id: c.id,
          name: c.name || c.notify || '',
          notify: c.notify || '',
        })),
      });
    });

    sock.ev.on('contacts.update', (updates: Array<{ id: string; name?: string; notify?: string }>) => {
      if (updates.length === 0) return;
      send({
        type: 'contacts_upsert',
        sessionId,
        contacts: updates.map((c: { id: string; name?: string; notify?: string }) => ({
          id: c.id,
          name: c.name || c.notify || '',
          notify: c.notify || '',
        })),
      });
    });

    // ── 消息接收（新消息 + 历史消息） ──

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sock.ev.on('messages.upsert', (upsert: { messages: any[]; type: string }) => {
      const { messages, type: upsertType } = upsert;
      if (!messages || messages.length === 0) return;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parsed = messages.map((m: any) => {
        const body =
          m.message?.conversation ||
          m.message?.extendedTextMessage?.text ||
          m.message?.imageMessage?.caption ||
          m.message?.videoMessage?.caption ||
          m.message?.documentMessage?.caption ||
          '';
        const msgType = m.message?.imageMessage ? 'image'
          : m.message?.videoMessage ? 'video'
          : m.message?.audioMessage ? 'audio'
          : m.message?.documentMessage ? 'document'
          : m.message?.stickerMessage ? 'sticker'
          : 'text';

        return {
          id: m.key?.id || '',
          remoteJid: m.key?.remoteJid || '',
          fromMe: m.key?.fromMe ?? false,
          body,
          timestamp: typeof m.messageTimestamp === 'number'
            ? m.messageTimestamp * 1000
            : (m.messageTimestamp?.low ?? 0) * 1000 || Date.now(),
          type: msgType,
          pushName: m.pushName || '',
        };
      }).filter((m: { id: string; remoteJid: string }) =>
        m.id && m.remoteJid && !m.remoteJid.includes('status@broadcast')
      );

      if (parsed.length === 0) return;

      send({
        type: 'message_upsert',
        sessionId,
        upsertType,
        messages: parsed,
      });
    });

    // ── 消息状态更新 ──

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sock.ev.on('messages.update', (updates: any[]) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const statusUpdates = updates.filter((u: any) => u.update?.status !== undefined).map((u: any) => ({
        id: u.key?.id || '',
        remoteJid: u.key?.remoteJid || '',
        fromMe: u.key?.fromMe ?? false,
        status: u.update.status,
      }));

      if (statusUpdates.length > 0) {
        send({ type: 'message_status', sessionId, updates: statusUpdates });
      }
    });

    // ── 接收主线程命令 ──

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    port.on('message', async (cmd: any) => {
      if (!cmd || !cmd.action) return;

      switch (cmd.action) {
        case 'send_message': {
          const { requestId, jid, text } = cmd;
          try {
            const result = await sock.sendMessage(jid, { text });
            send({
              type: 'send_result',
              sessionId,
              requestId,
              success: true,
              messageId: result?.key?.id || '',
              timestamp: Date.now(),
            });
          } catch (err: unknown) {
            send({
              type: 'send_result',
              sessionId,
              requestId,
              success: false,
              error: err instanceof Error ? err.message : String(err),
            });
          }
          break;
        }
        case 'read_messages': {
          const { keys } = cmd;
          try {
            await sock.readMessages(keys);
          } catch { /* ignore */ }
          break;
        }
      }
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    send({ type: 'error', sessionId, message });
    console.error('[Worker] Fatal error:', message);
  }
}

run();
