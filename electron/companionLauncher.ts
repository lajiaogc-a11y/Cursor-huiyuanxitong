/**
 * Companion 启动器（可被 start.ts CLI 和 Electron main process 共同 import）
 *
 * 职责：
 *   1. 创建 WhatsApp adapter（真实 Baileys 或 Demo）
 *   2. 启动本地 HTTP API（localhost:3100）
 *   3. 返回关闭句柄，供调用方管理生命周期
 */

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
  close: () => Promise<void>;
}

/**
 * 获取 WhatsApp 会话数据存储路径
 * Electron 模式：%APPDATA%/FastGC会员系统/wa_sessions
 * CLI 模式：./.wa_sessions（相对于 electron 目录）
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

    // Electron 主进程提供 app 模块但 globalThis.require 不可用时的备选
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

export async function startCompanionServer(options?: {
  port?: number;
  host?: string;
}): Promise<CompanionResult> {
  console.log('[Companion] startCompanionServer() called');
  const { adapter, mode } = await createAdapter();
  console.log(`[Companion] Adapter created: ${mode}`);

  const port = options?.port ?? DEFAULT_PORT;
  const host = options?.host ?? DEFAULT_HOST;
  console.log(`[Companion] Starting local API on ${host}:${port}...`);

  const result = await startLocalApi({
    adapter,
    adapterMode: mode,
    port,
    host,
  });

  console.log(`[Companion] Local API LISTENING on ${host}:${result.port}`);

  return { adapter, port: result.port, mode, close: result.close };
}

export { DEFAULT_PORT, DEFAULT_HOST };
