/**
 * IPC 通道常量（预留）
 *
 * 当前 Companion 运行在独立 Node.js 进程，前端通过 HTTP 访问 local-api。
 * IPC 通道用于未来 Electron 桌面客户端模式中 renderer ↔ main 通信。
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
