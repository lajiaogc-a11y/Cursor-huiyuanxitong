/**
 * 本地持久化存储（Phase 3 占位）
 *
 * 职责：
 *   1. 管理 companion 全局配置（端口、token、最大连接数等）
 *   2. 管理 WhatsApp 会话认证数据（每个 accountId 独立目录）
 *   3. 提供原子读写，防止并发冲突
 *
 * 技术选型：
 *   - electron-store（基于 JSON 文件，简单可靠）
 *   - 或 better-sqlite3（如果需要更复杂的查询）
 *   - Phase 3 建议先用 electron-store
 *
 * 存储路径：
 *   Electron: app.getPath('userData') → %APPDATA%/会员系统/
 *   开发阶段: ./electron/store/dev-data/
 *
 * ⚠ 当前为占位文件，不包含真实实现。
 */

import type { ICompanionStore, CompanionConfig } from './types';

export type { ICompanionStore, CompanionConfig };

export const STORE_VERSION = '0.0.0-placeholder';

/**
 * 未来的初始化函数签名
 *
 * export async function initStore(options?: {
 *   basePath?: string;
 * }): Promise<ICompanionStore> { ... }
 */
