/**
 * Electron 主进程入口（预留）
 *
 * 当前 Companion 通过 electron/start.ts 以 CLI 方式运行。
 * 本文件预留给未来 Electron BrowserWindow 桌面客户端模式。
 *
 * 启动顺序（未来）：
 *   app.whenReady()
 *     → startLocalApi()
 *     → createWindow()
 *
 * 接入方式：
 *   前端通过 fetch('http://localhost:3100/...') 调用 local-api（Web/Electron 均兼容）
 */

export const ELECTRON_MAIN_VERSION = '0.1.0';
