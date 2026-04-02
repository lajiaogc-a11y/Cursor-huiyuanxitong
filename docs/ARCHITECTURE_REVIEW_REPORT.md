# CRM 项目架构审查报告

## 一、数据访问链路

### 1.1 现状概览

| 访问方式 | 使用场景 | 数量 | 说明 |
|----------|----------|------|------|
| **后端 API** | 订单、会员、礼品卡、报表、操作日志、登录日志、公司文档、积分、租户等 | 主要 | 通过 `apiClient` / `apiGet` 等，携带 JWT |
| **前端直连 Supabase** | 知识库、导航配置、权限、操作日志、积分、租户 RPC、会员门户、数据迁移等 | 大量 | 使用 `@/integrations/supabase/client`（anon key） |

### 1.2 前端直连 Supabase 清单

| 文件 | 用途 | 风险 |
|------|------|------|
| `hooks/useKnowledge.ts` | 分类/文章 CRUD、阅读状态、Storage、Realtime | 高：与 API 重复，RLS 依赖 |
| `components/layout/Sidebar.tsx` | role_permissions、菜单文案（代码内 i18n） | 高 |
| `stores/auditLogStore.ts` | operation_logs 查询、插入 | 高：与 /api/logs 重复 |
| `hooks/useOperationLogs.ts` | operation_logs 查询、Realtime | 高 |
| `services/points/memberPointsRpcService.ts` | 会员积分 RPC（无 JWT 时回退） | 中：会员端设计 |
| `services/tenantService.ts` | 租户 CRUD、仪表盘、员工列表等 RPC | 高 |
| `services/members/memberPortalSettingsService.ts` | 会员门户设置 RPC、Storage | 中 |
| `services/members/nameResolver.ts` | 会员/员工名称解析，cards/vendors/providers | 中 |
| `pages/OperationLogs.tsx` | 操作日志审计（members/employees/orders 等大量表） | 高 |
| `components/DataManagementTab.tsx` | 导入导出、数据删除、备忘录等（经后端 API） | 中 |
| `pages/member/MemberSettings.tsx` | member_get_orders、member_update_nickname RPC | 中 |
| `services/featureFlagService.ts` | 功能开关 RPC | 低 |
| `stores/pointsAccountStore.ts` | points_accounts 表 | 高 |
| `services/userDataSyncService.ts` | profiles/employees 同步 | 高 |
| `services/dataMigrationService.ts` | 数据迁移 RPC | 高 |
| `components/PhoneExtractPanel.tsx` | verify_employee_login_detailed RPC | 中 |
| `services/finance/ledgerTransactionService.ts` | 账本 RPC、ledger_transactions | 高 |
| `components/member/MemberActivityDataContent.tsx` | redeem_points_and_record RPC | 中 |
| `pages/ExchangeRate.tsx` | Supabase Edge Functions (fetch-usdt-rates) | 低 |
| `hooks/useLoginLogs.ts` | get-ip-location Edge Function | 低 |

### 1.3 数据访问链路图

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              前端 (React)                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────┐                    ┌─────────────────────────────┐ │
│  │ apiClient / apiGet   │                    │ supabase (anon key)         │ │
│  │ JWT in Authorization │                    │ 直连 REST / RPC / Realtime  │ │
│  └──────────┬───────────┘                    └──────────────┬──────────────┘ │
│             │                                               │                 │
└─────────────┼───────────────────────────────────────────────┼─────────────────┘
              │                                               │
              ▼                                               ▼
┌─────────────────────────────┐              ┌─────────────────────────────────┐
│ 后端 API (Express)          │              │ Supabase (PostgREST / RLS)        │
│ /api/*                      │              │ 受 RLS 限制                      │
│ authMiddleware → req.user   │              │ 无 JWT 时可能返回空                │
└──────────────┬──────────────┘              └─────────────────────────────────┘
              │
              ▼
┌─────────────────────────────┐
│ supabaseAdmin (service_role)│
│ 绕过 RLS，全表访问          │
└─────────────────────────────┘
```

---

## 二、权限链路

### 2.1 JWT 解析（统一）

| 环节 | 实现 | 位置 |
|------|------|------|
| 登录生成 JWT | `loginService` | `server/src/modules/auth/service.ts` |
| JWT Payload | `sub, tenant_id, role, username, ...` | `server/src/modules/auth/jwt.ts` |
| 解析 | `verifyToken` | `server/src/modules/auth/jwt.ts` |
| 挂载 | `authMiddleware` → `req.user` | `server/src/middlewares/auth.ts` |

**结论**：JWT 解析统一，仅使用 `authMiddleware` + `verifyToken`。

### 2.2 受保护路由

所有需认证的 API 均使用 `authMiddleware`：

- `/api/auth/me`
- `/api/members/*`
- `/api/orders/*`
- `/api/giftcards/*`
- `/api/reports/*`
- `/api/knowledge/*`
- `/api/logs/*`
- `/api/data/*`（除 ip-access-control）
- `/api/tenants/*`
- `/api/points/*`
- `/api/phone-pool/*`
- `/api/admin/*`
- `/api/member-portal-settings/*`
- `/api/whatsapp/*`

### 2.3 tenant_id 传递（不完整）

| 阶段 | 状态 | 说明 |
|------|------|------|
| 登录 RPC | ✅ | `verify_employee_login_detailed` 返回 tenant_id |
| JWT Payload | ✅ | 含 `tenant_id` |
| req.user | ✅ | `authMiddleware` 写入 `tenant_id` |
| API 查询 | ⚠️ | 当前多数接口已移除 tenant 过滤，返回全量数据 |
| 前端 | ⚠️ | 未统一从 user 读取 tenant_id 并传给 API |

**结论**：tenant_id 在登录→JWT→req.user 链路完整，但在业务查询和前端调用中未系统使用。

---

## 三、API 调用链路

### 3.1 统一入口

| 入口 | 用途 | Token |
|------|------|-------|
| `@/lib/apiClient` | 主 API 客户端 | localStorage `api_access_token` → Authorization |
| `@/api/client` | apiGet/apiPost 等封装 | 同上 |
| `@/api/data` | 数据 API 封装 | 同上 |
| `@/api/members` | 会员 API | 同上 |
| `@/api/auth` | 登录/登出/me | 同上 |

### 3.2 非统一调用

| 方式 | 示例 | 说明 |
|------|------|------|
| 直连 Supabase | `supabase.from()`, `supabase.rpc()` | 使用 anon key，依赖 RLS |
| 裸 fetch | AuthContext (get-client-ip, validate-ip-country) | 使用 SUPABASE_PUBLISHABLE_KEY |
| 裸 fetch | useLoginLogs (get-ip-location) | 无 Authorization |
| 裸 fetch | ExchangeRate, UsdtRatePanel | Supabase Edge Functions |

### 3.3 API 路径与代理

- 前端：`VITE_API_BASE` 为空时使用相对路径 `/api`
- Vite 代理：`/api` → `http://localhost:3001`
- 后端：Express 挂载 `/api/*` 路由

---

## 四、env 配置

### 4.1 前端 (.env)

| 变量 | 说明 |
|------|------|
| `VITE_SUPABASE_URL` | Supabase 项目 URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | anon key（前端 Supabase 客户端） |
| `VITE_SUPABASE_PROJECT_ID` | 项目 ID（Edge Functions 等） |
| `VITE_API_BASE` | 后端 API 基地址，空则同源 |
| `SUPABASE_SERVICE_ROLE_KEY` | 根目录 .env.example 有，用于数据恢复等 |

### 4.2 后端 (server/.env)

| 变量 | 说明 |
|------|------|
| `PORT` | 服务端口 |
| `NODE_ENV` | 环境 |
| `SUPABASE_URL` | Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key |
| `SUPABASE_ANON_KEY` | anon key（orders 等 RPC 用） |
| `JWT_SECRET` | JWT 签名密钥 |

### 4.3 不一致点

| 问题 | 说明 |
|------|------|
| 命名 | 前端 `VITE_SUPABASE_PUBLISHABLE_KEY` vs 后端 `SUPABASE_ANON_KEY`，实际为同一 key |
| 根目录 SERVICE_ROLE | 根 .env.example 含 `SUPABASE_SERVICE_ROLE_KEY`，通常应仅在 server 使用 |
| JWT_SECRET | 仅后端需要，未在前端 .env.example 中体现 |

---

## 五、问题与建议

### 5.1 高优先级

1. **前端直连 Supabase 过多**
   - 建议：知识库、操作日志、导航配置、权限等逐步迁移到后端 API，由 supabaseAdmin 访问，统一鉴权与 tenant 隔离。
2. **数据访问双轨**
   - 知识库、操作日志等同时存在 API 与 Supabase 直连，易导致行为不一致。
   - 建议：选定单一数据源（优先 API），逐步下线直连。

### 5.2 中优先级

3. **tenant_id 未全链路使用**
   - 当前多数 API 已不做 tenant 过滤。
   - 建议：若需多租户隔离，在 Controller/Repository 中统一使用 `req.user.tenant_id` 过滤。
4. **会员端与员工端混用**
   - `memberPointsRpcService` 等按路径/JWT 在 API 与 Supabase 间切换。
   - 建议：明确会员端鉴权方式（如 member token），并统一数据访问路径。

### 5.3 低优先级

5. **env 命名与文档**
   - 统一 Publishable/Anon 的命名，并在 .env.example 中补充说明。
6. **调试日志**
   - 移除或通过环境变量控制 `[DEBUG auth]`、`[DEBUG knowledge]` 等日志。

---

## 六、架构改进建议图

```
目标架构（推荐）：

前端
  │
  ├─ apiClient (JWT) ──────────────────► 后端 API ─► authMiddleware
  │                                                    │
  │                                                    ▼
  │                                              supabaseAdmin
  │                                              (service_role)
  │
  └─ Supabase 直连（仅限）
       - 会员端匿名/轻鉴权场景
       - Storage 公开资源
       - Realtime（若需，可考虑通过 API 中转）
```

---

*报告生成时间：基于当前代码库静态分析*
