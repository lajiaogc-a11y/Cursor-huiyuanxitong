/**
 * WhatsApp 多会话管理器（Phase 3 占位）
 *
 * 职责：
 *   1. 管理多个 WhatsApp 会话实例的生命周期
 *   2. 每个实例代表一个已登录的 WhatsApp 号码
 *   3. 提供统一的 getSessions / getConversations / getMessages / sendMessage 接口
 *   4. 处理会话连接/断开/重连逻辑
 *   5. 通过事件总线将新消息/状态变化推送给上层
 *
 * 技术选型预留（待决策）：
 *
 *   方案 A: whatsapp-web.js（基于 Puppeteer）
 *     优势: 开源、功能全、社区活跃
 *     风险: 依赖 Chromium，内存占用较高，多实例时需控制资源
 *     每个实例约 150-300 MB 内存
 *
 *   方案 B: Baileys（基于 WebSocket 协议直连）
 *     优势: 轻量、不依赖浏览器、多实例友好
 *     风险: 社区维护不稳定、协议变化可能导致中断
 *     每个实例约 30-50 MB 内存
 *
 *   方案 C: WhatsApp Cloud API（官方 Meta Business API）
 *     优势: 官方支持、无封号风险
 *     限制: 需要 Meta Business 审核、按消息计费、不适合个人号
 *
 *   建议: Phase 3+ 先用方案 B (Baileys) 做原型，生产环境评估后再决定。
 *
 * 资源管理：
 *   - 最大同时连接数建议: 5 个实例
 *   - 每个实例独立的认证存储目录: electron/store/sessions/{accountId}/
 *   - 断线自动重连: 间隔 5s → 15s → 30s → 60s (指数退避)
 *
 * ⚠ 当前为占位文件，不包含真实实现。
 */

import type { ISessionManager, SessionInstance } from './types';

export type { ISessionManager, SessionInstance };

export const SESSION_MANAGER_VERSION = '0.0.0-placeholder';

/**
 * 未来的工厂函数签名
 *
 * export async function initSessionManager(options: {
 *   storePath: string;
 *   maxSessions?: number;
 *   onNewMessage?: (accountId: string, message: LocalMessage) => void;
 *   onStatusChange?: (accountId: string, state: SessionState) => void;
 * }): Promise<ISessionManager> { ... }
 */
