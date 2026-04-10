/**
 * Electron 主进程入口（Phase 3 占位）
 *
 * 职责：
 *   1. 创建 BrowserWindow 加载前端页面
 *   2. 启动 local-api HTTP 服务（供前端 localWhatsappBridge fetch）
 *   3. 初始化 session-manager（管理多 WhatsApp 实例）
 *   4. 注册 IPC handlers（渲染进程 ↔ 主进程通信）
 *   5. 管理 app 生命周期（ready / quit / activate）
 *
 * 启动顺序：
 *   app.whenReady()
 *     → initStore()          // 读取持久化配置
 *     → startLocalApi()      // 启动 localhost:3100 HTTP 服务
 *     → initSessionManager() // 初始化 WhatsApp 会话管理器
 *     → registerIpcHandlers()// 注册 IPC 通道
 *     → createWindow()       // 创建 BrowserWindow
 *
 * ⚠ 当前为占位文件，不包含真实实现。
 *   真实实现时将替换 electron/main.js（当前的基础 BrowserWindow shell）。
 */

// ── 占位导出（防止空模块报错） ──

export const ELECTRON_MAIN_VERSION = '0.0.0-placeholder';

/**
 * 未来的启动函数签名
 *
 * import { initStore } from '../store';
 * import { startLocalApi } from '../local-api';
 * import { initSessionManager } from '../session-manager';
 * import { registerIpcHandlers } from './ipc-handlers';
 *
 * async function bootstrap() {
 *   await initStore();
 *   await startLocalApi({ port: 3100 });
 *   await initSessionManager();
 *   registerIpcHandlers();
 *   createWindow();
 * }
 */
