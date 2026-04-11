/**
 * Electron 主进程
 *
 * 启动顺序：
 *   1. app.whenReady()
 *   2. bootCompanion() — 创建 adapter + 启动 local API (localhost:3100)
 *   3. createWindow()  — 创建 BrowserWindow 加载前端
 *
 * 生产模式：加载 https://admin.crm.fastgc.cc/dashboard/whatsapp
 * 开发模式：加载 http://localhost:5173/dashboard/whatsapp
 */

import { app, BrowserWindow, shell, session, dialog } from 'electron';
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
let companionError: string | null = null;

function log(tag: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [Electron:${tag}] ${msg}`);
}

function logError(tag: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`[${ts}] [Electron:${tag}] ${msg}`);
}

// ── Companion 启动 ──

async function bootCompanion(): Promise<void> {
  log('boot', 'Importing companionLauncher...');

  const { startCompanionServer } = await import('../companionLauncher.js');
  log('boot', 'companionLauncher imported OK');

  log('boot', `startCompanionServer() calling (isDev=${isDev}, packaged=${app.isPackaged})`);
  log('boot', `userData = ${app.getPath('userData')}`);

  const result = await startCompanionServer();
  companionAdapter = result.adapter;
  companionClose = result.close;
  log('boot', `Companion STARTED — mode=${result.mode}, port=${result.port}`);
}

// ── BrowserWindow ──

function createWindow(): void {
  const preloadPath = join(__selfDir, 'preload.js');
  log('window', `preload = ${preloadPath}`);

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
  log('window', `Loading ${loadUrl}`);
  mainWindow.loadURL(loadUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    log('window', 'Window visible');
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
  log('lifecycle', '=== APP READY ===');
  log('lifecycle', `version=${app.getVersion()}, electron=${process.versions.electron}, node=${process.versions.node}`);
  log('lifecycle', `exe=${process.execPath}`);
  log('lifecycle', `cwd=${process.cwd()}`);
  log('lifecycle', `resourcesPath=${process.resourcesPath ?? 'N/A'}`);
  log('lifecycle', `__selfDir=${__selfDir}`);

  try {
    await bootCompanion();
    log('lifecycle', 'Companion boot SUCCESS');
  } catch (err: unknown) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
    companionError = msg;
    logError('lifecycle', `Companion boot FAILED:\n${msg}`);
    dialog.showErrorBox(
      'Companion 启动失败',
      `本地 WhatsApp 服务未能启动，工作台将无法连接。\n\n原因: ${err instanceof Error ? err.message : String(err)}\n\n请联系管理员或查看日志。`,
    );
  }

  createWindow();
  log('lifecycle', 'Window created');
});

app.on('window-all-closed', () => {
  log('lifecycle', 'All windows closed');
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('before-quit', async () => {
  log('lifecycle', 'before-quit: cleaning up...');
  try {
    if (companionAdapter) await companionAdapter.destroy();
  } catch { /* ignore */ }
  try {
    if (companionClose) await companionClose();
  } catch { /* ignore */ }
  log('lifecycle', 'cleanup done');
});
