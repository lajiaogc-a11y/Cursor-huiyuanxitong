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
 * CLI 模式：./wa_sessions（相对于 electron 目录）
 */
function getDataPath(): string {
  if (process.env.ELECTRON_APP === '1') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const electron = require('electron');
      return join(electron.app.getPath('userData'), 'wa_sessions');
    } catch { /* fall through */ }
  }
  return join(__selfDir, '.wa_sessions');
}

export async function createAdapter(): Promise<{ adapter: IWhatsAppAdapter; mode: string }> {
  if (process.env.USE_DEMO === '1') {
    console.warn('[Companion] ⚠ USE_DEMO=1 — 强制演示模式，数据非真实');
    const { createDemoAdapter } = await import('./session-manager/demoAdapter.js');
    return { adapter: createDemoAdapter(), mode: 'Demo (explicit)' };
  }

  const { WhatsAppAdapter } = await import('./session-manager/whatsappAdapter.js');
  const dataPath = getDataPath();
  const adapter = await WhatsAppAdapter.create(dataPath);
  return { adapter, mode: 'Baileys (real)' };
}

export async function startCompanionServer(options?: {
  port?: number;
  host?: string;
}): Promise<CompanionResult> {
  const { adapter, mode } = await createAdapter();
  const { port, close } = await startLocalApi({
    adapter,
    adapterMode: mode,
    port: options?.port ?? DEFAULT_PORT,
    host: options?.host ?? DEFAULT_HOST,
  });

  return { adapter, port, mode, close };
}

export { DEFAULT_PORT, DEFAULT_HOST };
