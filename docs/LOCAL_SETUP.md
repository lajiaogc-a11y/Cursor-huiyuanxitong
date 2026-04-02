# 本地运行配置指南（MySQL + Node API）

员工登录与业务数据均由 **MySQL** 与本仓库 `server/`（Express）提供，**不需要** Supabase 项目或密钥。

## 1. 后端起不来 / 登录报数据库错误

### MySQL 未配置或密码错误

在 `server/.env` 中配置（或任选其一）：

- `DATABASE_URL=mysql://用户:密码@主机:3306/gc_member_system`，或
- `MYSQL_HOST`、`MYSQL_PORT`、`MYSQL_USER`、**`MYSQL_PASSWORD`**、`MYSQL_DATABASE`

并先创建数据库，再启动 API（开发环境会在启动时跑迁移）：

```sql
CREATE DATABASE gc_member_system CHARACTER SET utf8mb4;
```

### 后端未启动

```powershell
cd server
npm install
npm run dev
```

默认监听 **http://localhost:3001**。

### 前端联调

根目录 `npm run dev`（默认 **8081**）时，Vite 会将 `/api` 代理到 3001。若前后端分域，构建时设置 `VITE_API_BASE` 指向 API 根地址（无尾部斜杠）。

## 2. 公司文档、操作日志、登录日志为空

这些能力依赖后端 `/api/data/*`。请先启动 `server`，并确认 `server/.env` 中 MySQL 与 `JWT_SECRET` 已配置。

## 3. 生产环境「Internal Server Error」

- **同源**：反代 `/api` 到 Node 即可。
- **前后端分离**：构建前端时设置 `VITE_API_BASE` 为 API 根 URL。

## 4. 关于「Supabase」字样

前端仍保留 `@/integrations/supabase/client` **命名**，实为将旧版 `supabase.from` / `rpc` 调用 **转发到本系统 `/api/data/*`**，不会连接 Supabase 云端。无需配置 `VITE_SUPABASE_*`。

## 5. 邀请排行榜（假用户增长与接口）

- **会员接口**：`GET /api/invite/ranking`（会员 JWT），返回 `{ success, top5: [{ name, invite_count, is_fake }] }`，为真实会员与系统假用户合并排序后的前 5 名。
- **后台**：会员系统 → **活动数据** → 子页 **邀请设置**；CLI 种子：`cd server && npm run seed:invite-leaderboard`（可传 `[tenantId] [--replace]`，或设 `INVITE_LB_SEED_TENANT_ID`，见 `server/src/cli/seedInviteLeaderboardFifty.ts` 注释）。
- **定时任务**：API 进程启动后每小时跑一次检查；每个租户距上次增长满 **`INVITE_LEADERBOARD_GROWTH_HOURS` 小时**（默认 **72**）才对假用户执行一轮随机增量。多实例下用表 `invite_leaderboard_cron_ticket` 行锁避免并发重复增长。
- **关闭所有定时任务**（仅联调 UI）：设置 `SKIP_STARTUP_SCHEDULERS=1`。
