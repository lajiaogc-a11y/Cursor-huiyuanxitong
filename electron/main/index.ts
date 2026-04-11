/**
 * Electron 主进程
 *
 * 启动顺序：
 *   1. app.whenReady()
 *   2. startCompanionServer() — 启动本地 API（localhost:3100）
 *   3. createWindow() — 创建 BrowserWindow 加载前端
 *
 * 生产模式：加载 https://admin.crm.fastgc.cc（自动保持登录状态）
 * 开发模式：加载 http://localhost:5173（Vite dev server）
 */

import { app, BrowserWindow, shell, session } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IWhatsAppAdapter } from '../session-manager/adapterInterface.js';

const __selfFile = fileURLToPath(import.meta.url);
const __selfDir = dirname(__selfFile);

process.env.ELECTRON_APP = '1';

export const ELECTRON_MAIN_VERSION = '1.0.0';

const isDev = !app.isPackaged;
const PROD_URL = 'https://admin.crm.fastgc.cc/dashboard/whatsapp';
const DEV_URL = 'http://localhost:5173/dashboard/whatsapp';

let mainWindow: BrowserWindow | null = null;
let companionAdapter: IWhatsAppAdapter | null = null;
let companionClose: (() => Promise<void>) | null = null;

// ── Companion 启动 ──

async function bootCompanion(): Promise<void> {
  const { startCompanionServer } = await import('../companionLauncher.js');

  try {
    const result = await startCompanionServer();
    companionAdapter = result.adapter;
    companionClose = result.close;
    console.log(`[Electron] Companion v${ELECTRON_MAIN_VERSION} started — ${result.mode} on port ${result.port}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Electron] Companion failed to start: ${msg}`);
    throw err;
  }
}

// ── BrowserWindow ──

function createWindow(): void {
  const preloadPath = join(__selfDir, __selfFile.endsWith('.ts') ? 'preload.ts' : 'preload.js');

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    title: 'FastGC WhatsApp 工作台',
    icon: join(__selfDir, '../../public/favicon.ico'),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    show: false,
  });

  // 确保 CSP 允许连接 localhost:3100（companion API）
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = { ...details.responseHeaders };
    const cspKey = Object.keys(headers).find(k => k.toLowerCase() === 'content-security-policy');
    if (cspKey && headers[cspKey]) {
      headers[cspKey] = headers[cspKey]!.map(v =>
        v.replace(/connect-src\s/, 'connect-src http://localhost:3100 http://127.0.0.1:3100 '),
      );
    }
    callback({ responseHeaders: headers });
  });

  const loadUrl = isDev ? DEV_URL : PROD_URL;
  console.log(`[Electron] Loading ${loadUrl}`);
  mainWindow.loadURL(loadUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── App 生命周期 ──

app.whenReady().then(async () => {
  try {
    await bootCompanion();
  } catch {
    // Companion 启动失败也创建窗口，前端会显示离线状态
    console.warn('[Electron] Continuing without companion...');
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', async () => {
  try {
    if (companionAdapter) await companionAdapter.destroy();
  } catch { /* ignore */ }
  try {
    if (companionClose) await companionClose();
  } catch { /* ignore */ }
});
