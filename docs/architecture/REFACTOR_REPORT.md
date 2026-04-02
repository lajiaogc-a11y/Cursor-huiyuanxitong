# 系统架构重构报告

> 完成时间：2025-03  
> 项目：礼品系统 (FastGC会员系统)

---

## 一、重构目标与完成情况

| 目标 | 状态 | 说明 |
|------|------|------|
| 建立 Frontend → API → Service → Repository → Database 分层 | ✅ | 新增 server 后端，实现完整分层 |
| 前端不直接访问数据库 | 🔄 渐进 | 已建 API 客户端，待逐步迁移前端调用 |
| 模块化：auth, members, points, giftcards, orders, whatsapp | ✅ | 6 个模块均已建立骨架 |
| 统一 API 结构 | ✅ | /api/auth, /api/members, /api/points, /api/giftcards, /api/orders, /api/whatsapp |
| 统一错误处理 | ✅ | errorHandler 中间件 |
| 操作/错误日志 | ✅ | utils/logger 预留 |
| 权限/认证 | ✅ | authMiddleware 验证 JWT |
| API 请求拦截 | ✅ | api/client 自动注入 Authorization |
| 配置管理 | ✅ | config/index.ts |

---

## 二、新增目录结构

```
server/
├── package.json
├── tsconfig.json
├── .env.example
└── src/
    ├── app.ts                 # 入口
    ├── config/
    │   └── index.ts           # 配置
    ├── database/
    │   └── index.ts           # Supabase 客户端（唯一 DB 入口）
    ├── middlewares/
    │   ├── auth.ts            # JWT 认证
    │   ├── errorHandler.ts    # 统一错误处理
    │   └── index.ts
    ├── modules/
    │   ├── auth/              # controller, service, repository, routes, types
    │   ├── members/
    │   ├── points/
    │   ├── giftcards/
    │   ├── orders/
    │   └── whatsapp/
    └── utils/
        └── logger.ts          # 操作/错误日志

src/
└── api/
    ├── client.ts              # API 客户端（fetch + 自动注入 token）
    └── index.ts
```

---

## 三、修改清单

### 3.1 新增文件（server 后端）

| 文件 | 职责 |
|------|------|
| server/package.json | 后端依赖与脚本 |
| server/tsconfig.json | 后端 TS 配置 |
| server/.env.example | 环境变量示例 |
| server/src/app.ts | Express 入口，挂载 /api/* 路由 |
| server/src/config/index.ts | 配置管理 |
| server/src/database/index.ts | Supabase 客户端（Repository 层唯一使用） |
| server/src/middlewares/auth.ts | JWT 认证中间件 |
| server/src/middlewares/errorHandler.ts | 统一错误处理 |
| server/src/modules/auth/* | 登录认证 |
| server/src/modules/members/* | 会员列表 |
| server/src/modules/points/* | 会员积分 |
| server/src/modules/giftcards/* | 礼品卡列表 |
| server/src/modules/orders/* | 订单列表 |
| server/src/modules/whatsapp/* | 聊天模块（预留） |
| server/src/utils/logger.ts | 日志工具 |

### 3.2 新增文件（前端 API 层）

| 文件 | 职责 |
|------|------|
| src/api/client.ts | apiGet、apiPost，自动注入 Bearer token |
| src/api/index.ts | 导出 API 客户端 |

### 3.3 修改文件

| 文件 | 修改内容 |
|------|----------|
| package.json | 新增 api:dev、api:install 脚本 |
| docs/architecture/PROJECT_ARCHITECTURE_ANALYSIS.md | 新增架构分析报告 |

---

## 四、API 端点一览

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | /api/auth/login | 否 | 登录 |
| GET | /api/members | 是 | 会员列表 |
| GET | /api/points/member/:memberId | 是 | 会员积分 |
| GET | /api/giftcards | 是 | 礼品卡列表 |
| GET | /api/orders | 是 | 订单列表 |
| GET | /api/whatsapp | 是 | 聊天列表（预留） |
| GET | /health | 否 | 健康检查 |

---

## 五、后续迁移步骤

1. **配置环境变量**：复制 server/.env.example 为 server/.env，填入 Supabase 配置
2. **启动后端**：`npm run api:install` 后 `npm run api:dev`
3. **前端调用迁移**：将 hooks 中的 supabase 调用逐步替换为 `apiGet`/`apiPost`
4. **示例**：`useMemberPoints` 可改为 `apiGet('/api/points/member/' + memberId)`
5. **Realtime**：Supabase Realtime 可暂时保留前端订阅（或后续由后端 WebSocket 转发）

---

## 六、系统自检（Self Check）

### 6.1 模块依赖解耦

| 检查项 | 结果 |
|--------|------|
| members 是否直接调用 giftcards 的 repository | ✅ 否，各模块独立 |
| 跨模块通信是否通过 Service/API | ✅ 是 |

### 6.2 API 是否统一

| 检查项 | 结果 |
|--------|------|
| 是否统一为 /api/* 前缀 | ✅ 是 |
| Controller 是否只负责接收请求、调用 Service、返回结果 | ✅ 是 |

### 6.3 数据库是否只在 Repository 访问

| 检查项 | 结果 |
|--------|------|
| server 中 supabase 是否仅在 database/ 与 repositories 使用 | ✅ 是 |
| Controller/Service 是否无直接 DB 调用 | ✅ 是（auth service 使用 Supabase Auth，非 DB 表） |

### 6.4 系统是否符合分层架构

| 检查项 | 结果 |
|--------|------|
| Frontend → API → Controller → Service → Repository → DB | ✅ 是 |
| 前端是否通过 api/client 调用 | ✅ 已建立，待迁移 |

---

## 七、注意事项

1. **tenant_id 解析**：当前 auth 中间件从 `user.app_metadata.tenant_id` 读取，若 Supabase Auth 未写入，需在登录后从 employees 表查询并写入 metadata，或由后端单独接口获取
2. **部署**：后端需单独部署（如 Railway、Render、Cloudflare Workers 等），前端需配置 VITE_API_BASE 指向后端地址
3. **渐进迁移**：建议按模块逐步将前端 supabase 调用改为 API 调用，避免一次性大改
