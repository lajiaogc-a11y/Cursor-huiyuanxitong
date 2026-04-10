/**
 * 本地持久化存储类型定义（Phase 3 占位）
 *
 * 存储目录结构：
 *   {userData}/
 *   ├── config.json              ← 全局配置
 *   ├── sessions/
 *   │   ├── acct_main/           ← WhatsApp 认证数据（by accountId）
 *   │   │   ├── auth_info.json
 *   │   │   └── ...
 *   │   ├── acct_cs/
 *   │   └── ...
 *   └── logs/
 *       └── companion.log
 */

// ── 全局配置 ──

export interface CompanionConfig {
  localApiPort: number;         // 默认 3100
  localApiHost: string;         // 默认 127.0.0.1
  bridgeToken: string;          // 请求校验 token
  maxSessions: number;          // 最大同时连接数，默认 5
  autoReconnect: boolean;       // 断线自动重连
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export const DEFAULT_CONFIG: CompanionConfig = {
  localApiPort: 3100,
  localApiHost: '127.0.0.1',
  bridgeToken: '',
  maxSessions: 5,
  autoReconnect: true,
  logLevel: 'info',
};

// ── 会话认证数据 ──

export interface SessionAuthData {
  accountId: string;
  displayName: string;
  phone: string;
  authState: Record<string, unknown>;
  lastAuthAt: string;
}

// ── Store 接口 ──

export interface ICompanionStore {
  getConfig(): CompanionConfig;
  updateConfig(partial: Partial<CompanionConfig>): void;
  getSessionAuth(accountId: string): SessionAuthData | null;
  saveSessionAuth(accountId: string, data: SessionAuthData): void;
  removeSessionAuth(accountId: string): void;
  listSessionIds(): string[];
}
