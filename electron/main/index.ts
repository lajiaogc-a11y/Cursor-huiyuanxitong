/**
 * Electron 主进程
 *
 * 启动顺序：
 *   1. 获取单实例锁（防止多开）
 *   2. app.whenReady()
 *   3. bootCompanion() — 检测端口 → 复用/新建 Companion
 *   4. setupAutoUpdater() — 生产模式下检测更新
 *   5. createWindow()  — 创建 BrowserWindow 加载前端
 *
 * 生产模式：加载 https://admin.crm.fastgc.cc/dashboard/whatsapp
 * 开发模式：加载 http://localhost:5173/dashboard/whatsapp
 *
 * ── 自动更新架构 ──
 * 更新源：https://admin.crm.fastgc.cc/downloads/latest.yml
 * 依赖：electron-updater（需在 electron/package.json 中添加后安装）
 * 发布流程：
 *   1. 修改 package.json 版本号
 *   2. npm run build:electron:release → 生成 FastGC-WhatsApp-Setup-X.X.X.exe + latest.yml
 *   3. 运行 npm run release:electron → 自动上传到服务器并更新数据库
 * 环境策略：
 *   - dev: 不检测更新（isDev = true 时跳过）
 *   - staging: 可设 ELECTRON_UPDATER_TEST=1 强制检测
 *   - prod: 启动后 30 秒自动检测，每 4 小时轮检
 */

import { app, BrowserWindow, shell, session, dialog, ipcMain } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { autoUpdater } from 'electron-updater';
import electronLog from 'electron-log/main';
import type { IWhatsAppAdapter } from '../session-manager/adapterInterface.js';

const __selfFile = fileURLToPath(import.meta.url);
const __selfDir = dirname(__selfFile);

process.env.ELECTRON_APP = '1';

/** 版本号以 package.json 为单一来源，通过 app.getVersion() 获取 */
export const ELECTRON_MAIN_VERSION = app.getVersion();

const isDev = !app.isPackaged;

// ── electron-log 初始化（在任何 electronLog 调用之前）──
electronLog.initialize({ preload: false });
electronLog.transports.file.level = 'info';
electronLog.transports.console.level = isDev ? 'debug' : 'warn';

const PROD_URL = 'https://admin.crm.fastgc.cc/dashboard/whatsapp';
const DEV_URL = 'http://localhost:5173/dashboard/whatsapp';

let mainWindow: BrowserWindow | null = null;
let companionAdapter: IWhatsAppAdapter | null = null;
let companionClose: (() => Promise<void>) | null = null;
let companionReused = false;
let updateDownloaded = false;

/** 主进程控制台日志（带时间戳） */
function logMain(tag: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] [Electron:${tag}] ${msg}`);
}

function logMainError(tag: string, msg: string) {
  const ts = new Date().toISOString().slice(11, 23);
  console.error(`[${ts}] [Electron:${tag}] ${msg}`);
}

// ── 单实例锁：防止多开客户端 ──

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  logMain('lock', 'Another instance is already running — quitting');
  app.quit();
} else {
  app.on('second-instance', () => {
    logMain('lock', 'Second instance detected — focusing existing window');
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// ── Companion 启动 ──

async function bootCompanion(): Promise<void> {
  logMain('boot', 'Importing companionLauncher...');

  const { startCompanionServer } = await import('../companionLauncher.js');
  logMain('boot', 'companionLauncher imported OK');

  logMain('boot', `startCompanionServer() calling (isDev=${isDev}, packaged=${app.isPackaged})`);
  logMain('boot', `userData = ${app.getPath('userData')}`);

  const result = await startCompanionServer();
  companionAdapter = result.adapter;
  companionClose = result.close;
  companionReused = result.reused;

  if (result.reused) {
    logMain('boot', `Companion REUSED — existing instance on port ${result.port}`);
  } else {
    logMain('boot', `Companion STARTED (new) — mode=${result.mode}, port=${result.port}`);
  }
}

// ── BrowserWindow ──

function createWindow(): void {
  const preloadPath = join(__selfDir, 'preload.js');
  logMain('window', `preload = ${preloadPath}`);

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
  logMain('window', `Loading ${loadUrl}`);
  mainWindow.loadURL(loadUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    logMain('window', 'Window visible');
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

// ── 友好错误提示 ──

function showCompanionError(err: unknown): void {
  const rawMsg = err instanceof Error ? err.message : String(err);

  if (rawMsg.includes('PORT_CONFLICT')) {
    dialog.showErrorBox(
      '端口被占用',
      '端口 3100 已被其他程序占用，Companion 无法启动。\n\n' +
      '解决方法：\n' +
      '1. 在任务管理器中关闭占用端口 3100 的程序\n' +
      '2. 重新启动本客户端\n\n' +
      '如不确定哪个程序占用，可尝试重启电脑。',
    );
    return;
  }

  dialog.showErrorBox(
    'Companion 启动失败',
    `本地 WhatsApp 服务未能启动，工作台将无法连接。\n\n原因: ${rawMsg}\n\n请联系管理员或查看日志。`,
  );
}

// ── 自动更新（生产模式）──
//
// 更新源：https://admin.crm.fastgc.cc/downloads/latest.yml
// 发布时：npm run release:electron（自动上传安装包 + latest.yml + 更新DB）
// 日志路径：%APPDATA%\FastGC WhatsApp 工作台\logs\main.log

/** 更新状态推送给渲染进程 */
type UpdateStatus =
  | { state: 'checking' }
  | { state: 'available'; version: string }
  | { state: 'not-available'; version: string }
  | { state: 'downloading'; percent: number }
  | { state: 'downloaded'; version: string }
  | { state: 'error'; message: string };

function sendUpdateStatus(status: UpdateStatus): void {
  try {
    mainWindow?.webContents.send('update-status', status);
  } catch { /* window may be destroyed */ }
}

function setupAutoUpdater(): void {
  if (isDev && process.env.ELECTRON_UPDATER_TEST !== '1') {
    electronLog.info('[updater] Dev mode — skipping auto-update check');
    return;
  }

  autoUpdater.logger = electronLog;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on('checking-for-update', () => {
    electronLog.info('[updater] checking-for-update');
    sendUpdateStatus({ state: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    electronLog.info(`[updater] update-available  v${info.version}  releaseDate=${info.releaseDate}`);
    sendUpdateStatus({ state: 'available', version: info.version });
  });

  autoUpdater.on('update-not-available', (info) => {
    electronLog.info(`[updater] update-not-available  current=v${app.getVersion()}  latest=v${info.version}`);
    sendUpdateStatus({ state: 'not-available', version: info.version });
  });

  autoUpdater.on('download-progress', (progress) => {
    const pct = Math.round(progress.percent);
    electronLog.info(`[updater] download-progress  ${pct}%  speed=${Math.round((progress.bytesPerSecond ?? 0) / 1024)} KB/s`);
    sendUpdateStatus({ state: 'downloading', percent: pct });
  });

  autoUpdater.on('error', (err) => {
    electronLog.error(`[updater] error  ${err.message}`);
    sendUpdateStatus({ state: 'error', message: err.message });
  });

  autoUpdater.on('update-downloaded', (info) => {
    updateDownloaded = true;
    electronLog.info(`[updater] update-downloaded  v${info.version}`);
    sendUpdateStatus({ state: 'downloaded', version: info.version });

    dialog.showMessageBox({
      type: 'info',
      title: '发现新版本',
      message: `FastGC WhatsApp 工作台 v${info.version} 已下载完成`,
      detail: '点击"立即重启"以应用更新，或选择"稍后"在下次启动时自动安装。',
      buttons: ['立即重启', '稍后'],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) {
        electronLog.info('[updater] user triggered quitAndInstall');
        autoUpdater.quitAndInstall(true, true);
      } else {
        electronLog.info('[updater] user deferred update to next restart');
      }
    }).catch((e) => {
      electronLog.error(`[updater] dialog error: ${String(e)}`);
    });
  });

  const CHECK_DELAY_MS = 30_000;
  const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => electronLog.error(`[updater] checkForUpdates failed: ${String(e)}`));
  }, CHECK_DELAY_MS);

  setInterval(() => {
    autoUpdater.checkForUpdates().catch((e) => electronLog.error(`[updater] checkForUpdates failed: ${String(e)}`));
  }, CHECK_INTERVAL_MS);

  electronLog.info(`[updater] setup complete  checkDelay=${CHECK_DELAY_MS / 1000}s  interval=${CHECK_INTERVAL_MS / 3600000}h`);
}

// IPC: 渲染进程请求手动检测更新
ipcMain.on('check-for-update', () => {
  electronLog.info('[updater] check-for-update via IPC');
  autoUpdater.checkForUpdates().catch((e) => electronLog.error(`[updater] manual check failed: ${String(e)}`));
});

// IPC: 渲染进程请求立即安装更新
ipcMain.on('install-update', () => {
  if (updateDownloaded) {
    electronLog.info('[updater] install-update via IPC — calling quitAndInstall');
    autoUpdater.quitAndInstall(true, true);
  } else {
    electronLog.info('[updater] install-update via IPC — no update downloaded yet');
  }
});

// IPC: 渲染进程查询 app 版本（preload 中 process.env.npm_package_version 在打包后不可用）
ipcMain.handle('get-app-version', () => app.getVersion());

// ── App 生命周期 ──

if (gotLock) {
  app.whenReady().then(async () => {
    logMain('lifecycle', '=== APP READY ===');
    logMain('lifecycle', `app-version=${app.getVersion()}, electron=${process.versions.electron}, node=${process.versions.node}`);
    logMain('lifecycle', `exe=${process.execPath}`);
    logMain('lifecycle', `cwd=${process.cwd()}`);
    logMain('lifecycle', `resourcesPath=${process.resourcesPath ?? 'N/A'}`);
    logMain('lifecycle', `__selfDir=${__selfDir}`);

    try {
      await bootCompanion();
      logMain('lifecycle', companionReused ? 'Companion reuse SUCCESS' : 'Companion boot SUCCESS');
    } catch (err: unknown) {
      const msg = err instanceof Error ? `${err.message}\n${err.stack ?? ''}` : String(err);
      logMainError('lifecycle', `Companion boot FAILED:\n${msg}`);
      showCompanionError(err);
    }

    createWindow();
    logMain('lifecycle', 'Window created');

    setupAutoUpdater();
  });

  app.on('window-all-closed', () => {
    logMain('lifecycle', 'All windows closed');
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on('before-quit', async () => {
    logMain('lifecycle', 'before-quit: cleaning up...');
    if (!companionReused) {
      try { if (companionAdapter) await companionAdapter.destroy(); } catch { /* ignore */ }
      try { if (companionClose) await companionClose(); } catch { /* ignore */ }
    } else {
      logMain('lifecycle', 'Companion was reused — skipping cleanup (external instance)');
    }
    logMain('lifecycle', 'cleanup done');
  });
}
