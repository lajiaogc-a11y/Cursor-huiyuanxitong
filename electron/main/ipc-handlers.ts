/**
 * IPC 通道注册（Phase 3 占位）
 *
 * 职责：
 *   为渲染进程提供安全的 contextBridge API，通过 ipcMain.handle 暴露能力：
 *
 *   通道列表（契约）：
 *   ┌──────────────────────────────┬──────────────────────────────────┐
 *   │ Channel                      │ 说明                             │
 *   ├──────────────────────────────┼──────────────────────────────────┤
 *   │ wa:get-sessions              │ 获取已登录的 WhatsApp 会话列表   │
 *   │ wa:get-conversations         │ 获取指定账号的会话列表           │
 *   │ wa:get-messages              │ 获取指定联系人的消息             │
 *   │ wa:send-message              │ 人工发送消息                     │
 *   │ wa:mark-read                 │ 标记会话为已读                   │
 *   │ wa:get-account-stats         │ 获取账号统计                     │
 *   │ wa:session-status            │ 查询会话连接状态                 │
 *   │ wa:qr-code                   │ 获取新设备登录二维码             │
 *   └──────────────────────────────┴──────────────────────────────────┘
 *
 *   事件推送（主进程 → 渲染进程）：
 *   ┌──────────────────────────────┬──────────────────────────────────┐
 *   │ Event                        │ 说明                             │
 *   ├──────────────────────────────┼──────────────────────────────────┤
 *   │ wa:new-message               │ 收到新消息                       │
 *   │ wa:status-changed            │ 会话连接状态变化                 │
 *   │ wa:qr-updated                │ 二维码刷新                       │
 *   └──────────────────────────────┴──────────────────────────────────┘
 *
 * 接入方式选择：
 *   A) 渲染进程通过 contextBridge + preload.ts 调用 IPC（桌面版）
 *   B) 渲染进程通过 fetch('http://localhost:3100/...') 调用 local-api（Web 版兼容）
 *
 *   当前前端 localWhatsappBridge.ts 使用方式 B，天然兼容 Web 和 Electron。
 *
 * ⚠ 当前为占位文件。
 */

export const IPC_CHANNELS = {
  GET_SESSIONS:       'wa:get-sessions',
  GET_CONVERSATIONS:  'wa:get-conversations',
  GET_MESSAGES:       'wa:get-messages',
  SEND_MESSAGE:       'wa:send-message',
  MARK_READ:          'wa:mark-read',
  GET_ACCOUNT_STATS:  'wa:get-account-stats',
  SESSION_STATUS:     'wa:session-status',
  QR_CODE:            'wa:qr-code',
} as const;

export const IPC_EVENTS = {
  NEW_MESSAGE:        'wa:new-message',
  STATUS_CHANGED:     'wa:status-changed',
  QR_UPDATED:         'wa:qr-updated',
} as const;

/**
 * 未来的注册函数签名
 *
 * export function registerIpcHandlers(sessionManager: SessionManager): void {
 *   ipcMain.handle(IPC_CHANNELS.GET_SESSIONS, () => sessionManager.getSessions());
 *   ipcMain.handle(IPC_CHANNELS.GET_CONVERSATIONS, (_, accountId) => sessionManager.getConversations(accountId));
 *   // ...
 * }
 */
