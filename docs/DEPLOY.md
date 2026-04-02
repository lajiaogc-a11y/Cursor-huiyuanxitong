# 部署指南

## 发布清单（每次上线）

1. **推送源码**：`git push` 到主分支（与线上一致）。  
2. **后端 Node API**：在你实际使用的托管平台（VPS、容器、PaaS 等）拉取/构建最新代码后，**重启进程或触发 Redeploy**；环境变量仅在启动时读入。  
3. **前端**：`npm run deploy:full` 或 Cloudflare Pages 连 Git 自动构建；构建前确保 `.env` 里 **`VITE_API_BASE`** 指向生产 API。  
4. **MySQL**：表结构变更用 **`server/fix_schema.mjs`**、`mysql/fix_schema.mjs`、或 `npm run db:lottery-mysql` 等；**不要**把 `scripts/run-*-migration.mjs`（Postgres/Supabase SQL）当生产 MySQL 迁移入口。

---

## 架构说明（当前栈）

- **前端**：Vite + React → **Cloudflare Pages**（如 `https://crm.fastgc.cc`）  
- **后端**：Node.js Express → **自建或任意主机**（由 `VITE_API_BASE` 指向）  
- **数据库**：**MySQL**（`server/.env` 中 `MYSQL_*` 或 `DATABASE_URL` 为 `mysql://...`）

---

## 一、一键发布（前端 + 可选 Git 推送）

```powershell
npm run deploy:full
# 或带提交说明：
npm run deploy:full:msg -- "your message"
```

脚本顺序：**Git 提交并 push（若有改动）** → **`server` 目录 `npm run build`（tsc 校验）** → **根目录 `vite build`** → **`wrangler pages deploy`**。

仅发前端、不跑 server tsc 时可用：

```powershell
npm run deploy:cf
```

### 环境变量（根目录 `.env`，供 Wrangler / 构建）

| 变量 | 说明 |
|------|------|
| `CLOUDFLARE_API_TOKEN` 或 `CLOUDFLARE_API_KEY` | Pages 部署 Token |
| `CLOUDFLARE_ACCOUNT_ID` | 可选，脚本内有默认，可被 `.env` 覆盖 |
| `VITE_API_BASE` | **生产必填**：后端 API 根 URL |

也可用 `npx wrangler login` 代替 Token。

---

## 二、后端 API 部署

按你的实际主机操作，常见方式：

- **Git 拉取 + `cd server && npm ci && npm run build && npm start`**（或 `pm2` / `systemd`）  
- **Docker**：`server` 目录构建镜像，注入 `server/.env` 或平台环境变量  
- **PaaS**：连接仓库、Root Directory 填 `server`，构建命令 `npm install && npm run build`，启动 `npm start`

部署后务必 **重启**，使新代码与环境变量生效。

---

## 三、MySQL 迁移与补齐

| 方式 | 说明 |
|------|------|
| `cd server && node fix_schema.mjs` | 服务端随仓库提供的列/表补齐（按项目文档） |
| `npm run db:lottery-mysql` | 抽奖相关 MySQL 迁移 |
| `mysql/fix_schema.mjs` / `mysql/fix_columns.sql` | 运维可直接对库执行 |

`scripts/run-*-migration.mjs` 使用 **PostgreSQL 客户端**，面向历史 `supabase/migrations`；**生产 MySQL 不要用 deploy 脚本自动跑它们**。

---

## 四、环境变量清单（摘要）

### 前端构建（`.env`）

| 变量 | 说明 |
|------|------|
| `VITE_API_BASE` | 后端 API（生产必填） |
| `VITE_SUPABASE_URL` 等 | 若仍有个别 Edge/遗留能力，按 `server/.env.example` 与实际代码 |

### 后端（`server/.env`）

以仓库内 **`server/.env.example`** 为准；通常含 `JWT_SECRET`、`MYSQL_*` 或 `DATABASE_URL`（MySQL）、`NODE_ENV`、`TRUST_PROXY` 等。

---

## 五、登录地址（示例）

- 员工：`https://crm.fastgc.cc/staff/login`（若使用 `admin` 子域见 `DEPLOY_README.md`）  
- 会员：`https://crm.fastgc.cc/member/login`
