# WhatsApp Local Companion — 架构说明

> Phase 3 预留文档。当前只有目录骨架和占位类型，不含真实实现。

## 1. 整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                        前端 (React / Vite)                       │
│                                                                  │
│  Page (WhatsAppWorkbench)                                        │
│    │                                                             │
│    ├→ Service (localSessionBridgeService)   ← 业务逻辑           │
│    │    │                                                        │
│    │    └→ API Client (localWhatsappBridge) ← 请求抽象           │
│    │         │                                                   │
│    │         │  USE_MOCK = true  → 内存 mock 数据                │
│    │         │  USE_MOCK = false → fetch('http://localhost:3100') │
│    │         │                                                   │
├────┼─────────┼───────────────────────────────────────────────────┤
│    │         │                                                   │
│    │         ▼                                                   │
│  ┌─────────────────────────────────┐                             │
│  │  electron/local-api (HTTP)      │  ← localhost:3100           │
│  │  路由 → DTO 映射               │                             │
│  └────────────┬────────────────────┘                             │
│               │                                                  │
│               ▼                                                  │
│  ┌─────────────────────────────────┐                             │
│  │  electron/session-manager       │  ← 多 WhatsApp 实例管理    │
│  │  getSessions / sendMessage / …  │                             │
│  └────────────┬────────────────────┘                             │
│               │                                                  │
│               ▼                                                  │
│  ┌─────────────────────────────────┐                             │
│  │  electron/store                 │  ← 认证持久化 + 配置       │
│  │  config.json / sessions/        │                             │
│  └─────────────────────────────────┘                             │
│                                                                  │
│                   Electron Main Process                          │
└──────────────────────────────────────────────────────────────────┘
```

## 2. 目录结构

```
electron/
├── main.js                    ← 现有 BrowserWindow shell（Phase 1）
├── tsconfig.json              ← Electron 侧 TypeScript 配置
├── ARCHITECTURE.md            ← 本文件
│
├── main/                      ← 主进程入口 + IPC 注册
│   ├── index.ts               ← 启动编排（占位）
│   └── ipc-handlers.ts        ← IPC 通道契约 + 注册（占位）
│
├── session-manager/           ← WhatsApp 多会话管理
│   ├── index.ts               ← 工厂函数（占位）
│   └── types.ts               ← SessionInstance / ISessionManager 接口
│
├── local-api/                 ← 本地 HTTP API 服务
│   ├── index.ts               ← HTTP 服务启动（占位）
│   ├── routes.ts              ← 路由 + DTO 映射（占位）
│   └── types.ts               ← API 契约类型（与前端 wire types 对齐）
│
└── store/                     ← 持久化存储
    ├── index.ts               ← 初始化函数（占位）
    └── types.ts               ← 配置 + 认证数据类型
```

## 3. 各模块职责

### main/
- Electron 应用生命周期管理
- 按顺序启动 store → local-api → session-manager → IPC
- 创建 BrowserWindow 加载前端页面

### session-manager/
- 管理多个 WhatsApp 会话实例的完整生命周期
- 每个实例对应一个已登录的 WhatsApp 号码
- 提供统一的 `ISessionManager` 接口
- 处理连接/断开/重连/扫码逻辑
- 通过事件推送新消息和状态变化

### local-api/
- 在 `127.0.0.1:3100` 启动 HTTP 服务
- 将前端 `localWhatsappBridge.ts` 的 fetch 请求转发给 session-manager
- 负责内部类型 → DTO 的映射
- 统一响应格式 `{ success, data } | { success, error }`

### store/
- 管理 companion 全局配置（端口、token、最大连接数）
- 持久化 WhatsApp 认证数据（每个 accountId 独立子目录）
- 基于文件系统，使用 electron-store 或 better-sqlite3

## 4. Mock → Real 切换机制

前端 `src/api/localWhatsappBridge.ts` 内部有 `USE_MOCK` 开关：

```typescript
const USE_MOCK = true;  // ← 当前阶段：内存 mock
// const USE_MOCK = false; // ← 接入 companion 后切换
```

**切换步骤：**

1. 将 `USE_MOCK` 设为 `false`
2. 确保 Electron companion 已启动，`localhost:3100` 可访问
3. 所有 `bridgeGet` / `bridgePost` 调用自动走真实 HTTP

**上层完全不需要改动：**
- `localSessionBridgeService.ts`（Service 层）调用签名不变
- `WhatsAppWorkbench.tsx`（Page 层）调用签名不变
- 所有 UI 组件的 props 接口不变

## 5. 接入真实容器时的不改动保证

| 层级 | 是否需要改 | 原因 |
|------|-----------|------|
| Page (WhatsAppWorkbench) | 不改 | 只调用 Service 层 |
| Components (AccountList/ConversationList/…) | 不改 | 只接收 props |
| Service (localSessionBridgeService) | **可能微调** | 如需适配新的返回字段 |
| API Client (localWhatsappBridge) | **切 USE_MOCK** | mock→fetch，方法签名不变 |
| electron/local-api | 新实现 | 路由对接 session-manager |
| electron/session-manager | 新实现 | 接入真实 WhatsApp 库 |
| electron/store | 新实现 | 持久化配置和认证 |

## 6. 风险点

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| WhatsApp 协议变化导致库失效 | 高 | 选择活跃维护的库；session-manager 层隔离，换库不影响上层 |
| 多实例内存占用过高 | 中 | 限制 maxSessions=5；优先评估 Baileys（轻量） |
| 本地 API 端口冲突 | 低 | 支持配置端口；启动时检测端口可用性 |
| 认证数据泄露 | 中 | 存储在 userData 目录；加密敏感字段 |
| 封号风险（非官方 API） | 高 | 仅人工发送，不做自动化批量操作；尊重频率限制 |
| Electron 版本与 Node.js 兼容性 | 低 | 锁定 Electron 版本；CI 中测试构建 |

## 7. 接口稳定性建议

1. **前端 wire types 作为契约基准** — `localWhatsappBridge.ts` 中的类型就是接口契约
2. **新增字段用可选属性** — 不破坏现有客户端
3. **版本化 API 前缀** — 未来如需破坏性变更，使用 `/v2/sessions` 等
4. **健康检查端点** — `GET /health` 返回版本和连接状态，便于前端检测 companion 是否可用
5. **降级策略** — 如果 `localhost:3100` 不可达，前端自动 fallback 到 mock 数据
