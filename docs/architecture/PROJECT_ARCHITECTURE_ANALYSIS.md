# 项目架构分析报告

> 生成时间：2025-03  
> 项目：礼品系统 (FastGC会员系统)

---

## 一、当前架构概览

### 1.1 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | Vite + React 18 + TypeScript | SPA，部署至 Cloudflare Pages |
| 数据 | Supabase (PostgreSQL + Auth + Realtime) | BaaS，前端直连 |
| 状态 | React Query + Zustand | 多轨缓存并存 |
| 部署 | 纯静态 | 无独立后端服务 |

### 1.2 当前数据流（问题架构）

```
┌─────────────────────────────────────────────────────────────────────┐
│  Pages / Components / Hooks (65+ 文件直接调用 Supabase)              │
└─────────────────────────────────────────────────────────────────────┘
         │                    │                    │
         │ 直连                │ 直连                │ 直连
         ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  supabase.from()  │  supabase.rpc()  │  Supabase Realtime            │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  PostgreSQL (Supabase)                                              │
└─────────────────────────────────────────────────────────────────────┘
```

**核心问题**：前端直接访问数据库，无 API 层、无 Service/Repository 分层。

---

## 二、Supabase 直连统计

| 层级 | 文件数 | 代表 |
|------|--------|------|
| services | 28 | tenantService, pointsService, sharedDataService, taskService |
| hooks | 18 | useMembers, useMerchantConfig, useEmployees, useReportData |
| components | 12 | DataManagementTab, RateCalculator, MemberActivityDataContent |
| stores | 5 | activitySettingsStore, merchantConfigStore, employeeStore |
| pages | 10 | MerchantSettlement, OperationLogs, ActivityReports |
| contexts | 2 | AuthContext, MemberAuthContext |

**高耦合文件**：DataManagementTab (~69 次)、pointsService (~41 次)、OperationLogs (~42 次)、taskService (~37 次)、useMerchantConfig (~28 次)。

---

## 三、业务模块现状

| 模块 | 数据源 | 访问方式 | 分层情况 |
|------|--------|----------|----------|
| 订单 | orders, usdt_orders | RPC + from | 部分 DDD (application/domain/infrastructure) |
| 会员 | members, member_activity | RPC + from | 无分层，直连 |
| 积分 | points_ledger, points_accounts | from + RPC | 无分层，直连 |
| 礼品卡/活动 | activity_gifts, cards | from | 无分层，直连 |
| 员工 | employees | RPC + from | 无分层，直连 |
| 租户 | tenants | 全 RPC | 无分层 |
| 聊天/任务 | tasks, notifications | from + RPC | 无分层 |

---

## 四、问题清单

### 4.1 架构问题

1. **前端直连数据库**：违反「前端不能直接访问数据库」原则
2. **无 API 层**：所有请求直接到 Supabase，无法统一鉴权、限流、日志
3. **无 Service/Repository 分层**：业务逻辑与数据访问混杂
4. **模块耦合**：跨模块直接调用内部实现，如 members 调用 points 的 repository

### 4.2 数据刷新问题

5. **需手动刷新**：部分页面依赖用户手动刷新
6. **多轨刷新**：dataRefreshManager、realtimeManager、局部 hook 订阅、手动 invalidate 并存
7. **缓存不一致**：React Query、Zustand、模块级缓存边界不清

### 4.3 基础能力缺失

8. **无统一错误处理**：各模块自行处理错误
9. **无操作日志**：有 audit 表但无统一落库规范
10. **无 API 拦截器**：无法统一注入 token、处理 401
11. **无配置管理**：配置分散在 env 与代码中

---

## 五、目标架构

```
┌─────────────────────────────────────────────────────────────────────┐
│  Frontend (React)                                                   │
│  - 仅通过 fetch/axios 调用 API                                       │
│  - 不导入 supabase 客户端（除 Auth 可保留）                          │
└─────────────────────────────────────────────────────────────────────┘
         │ HTTP /api/*
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  API Layer (Controller)                                             │
│  - 接收请求、校验参数、调用 Service、返回 JSON                        │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Service Layer                                                      │
│  - 业务逻辑、事务编排、跨模块协调                                     │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Repository Layer                                                   │
│  - 唯一可操作数据库的层                                              │
│  - Supabase 客户端仅在此使用                                          │
└─────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Database (Supabase PostgreSQL)                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 六、与目标架构的差距

| 目标 | 当前 | 差距 |
|------|------|------|
| 前端不直连 DB | 65+ 文件直连 | 需全部改为 API 调用 |
| API 层 | 无 | 需新增后端 server |
| Service 层 | 有 services 但混杂 DB 调用 | 需抽离业务逻辑，去掉 DB |
| Repository 层 | 仅 orderRepository | 需为各模块补充 |
| 统一 API 结构 | 无 | 需 /api/auth, /api/members 等 |
| 模块解耦 | 跨模块直调 | 需通过 Service/API 通信 |

---

## 七、重构策略建议

1. **新增 backend server**：Node.js + Express/Hono，部署为独立服务或 Cloudflare Workers
2. **模块化**：auth, members, points, giftcards, orders, whatsapp（按业务拆分）
3. **渐进迁移**：先建骨架，再逐模块将前端调用改为 API，最后移除前端 Supabase 直连
4. **保留 Supabase Auth**：登录/登出可继续用 Supabase Auth，后端验证 JWT 后代理数据请求
