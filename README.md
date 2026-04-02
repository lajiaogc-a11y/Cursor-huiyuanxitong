# 礼品卡会员系统

面向礼品卡业务的 **员工管理后台**、**平台超级管理** 与 **会员门户**（登录、积分、抽奖、签到、分享/邀请奖励等）的一体化 Web 应用。前端为 Vite + React，后端为 Node（Express）+ MySQL。

## 功能概览

- **会员端**：手机号登录、首页、幸运抽奖、积分与兑换、邀请与分享奖励、个人设置；支持按域名仅展示会员入口（见 `src/routes/siteMode.ts`）。
- **员工端**：订单、会员与活动、汇率与任务、商家结算、审计与日志等（路由前缀 `/staff/*`）。
- **平台后台**：租户/公司管理、租户视图、平台级设置（`/staff/admin/*`，需平台超管权限）。
- **公开页**：如公开汇率 `/public-rates`。

路由分组与兼容说明见 **[docs/ROUTES_STRUCTURE.md](./docs/ROUTES_STRUCTURE.md)**。

## 技术栈（摘要）

- 前端：React、TypeScript、Vite、TanStack Query、React Router、Ant Design、Tailwind/shadcn 等。
- 后端：`server/` — Express、MySQL（`mysql2`）、JWT 鉴权。
- 数据访问：前端通过 `/api/*` 与后端交互；部分历史能力兼容表/RPC 代理（见服务端 `tableProxy`）。

## 本地开发

```bash
# 前端
npm install
npm run dev

# 后端（另开终端）
cd server && npm install && npm run dev
```

一键前后端（若已配置脚本）：

```bash
npm run dev:all
```

环境变量请按部署环境配置数据库连接、JWT 密钥等（参考 `server/.env.example` 与 **[server/docs/DEPLOY-SECURITY.md](./server/docs/DEPLOY-SECURITY.md)**）。邀请注册安全流程见 **[server/docs/INVITE-REGISTER.md](./server/docs/INVITE-REGISTER.md)**。

### 上线前数据库（会员积分商城幂等）

若使用 **积分商城兑换** RPC（`member_redeem_points_mall_item`），请在 MySQL 执行一次：

`mysql/migrations/20260322201000_redemptions_client_request_id.sql`

为 `redemptions` 表增加 `client_request_id` 及唯一索引，以支持前端传入的幂等键（防重复扣积分）。未执行时该 RPC 的 `INSERT` 可能报错，需尽快迁移。

抽奖、分享领奖在服务端已使用 **MySQL `GET_LOCK`** 与原有事务，降低并发双写风险。

## 构建与预览

```bash
npm run build
npm run preview
```

```bash
cd server && npm run build && npm start
```

## VPS / SSH 服务器部署

向 AI 发部署请求时请写明：**服务器项目路径、Git 分支、是否已 SSH、PM2 重启方式**。详见 **[docs/SERVER_SSH_DEPLOY.md](./docs/SERVER_SSH_DEPLOY.md)**；Linux 上一键脚本：**`scripts/deploy-server.sh`**。

## 目录提示

| 路径 | 说明 |
|------|------|
| `src/routes/` | 路由常量、域名模式、懒加载页面、重定向与会员/员工路由表 |
| `src/services/memberPortal/` | 会员门户 RPC（签到/分享/邀请 token/订单/昵称/邀请注册等）封装 |
| `src/services/memberPortal/memberAuthService.ts` | 会员登录 / 改密 / 拉取资料（`MemberAuthContext`）；`@/api/memberAuth` 为兼容重导出 |
| `src/services/members/memberAdminRpcService.ts` | 员工端：会员管理相关 RPC（设初始密码、邀请关系列表等） |
| `src/services/members/memberPointsRedeemRpcService.ts` | 员工端：会员活动积分兑换事务 RPC |
| `src/services/memberPortal/memberPortalDiagnosticsRpcService.ts` | 会员门户设置页：抽奖记录 / 会员操作日志等诊断 RPC |
| `src/services/webhooks/webhookAdminRpcService.ts` | Webhook 测试投递等 RPC |
| `src/services/observability/apiUsageStatsService.ts` | API 按日 / 按端点统计 RPC |
| `src/services/notifications/notificationService.ts` | 通知列表/已读/删除/创建 + 全部已读 RPC |
| `src/services/finance/marketRatesService.ts` | USDT/CNY、BTC 服务端代理拉取 |
| `src/services/members/memberPortalLiveUpdateService.ts` | 门户「实时更新」占位与轮询（`subscribe*` 走 `getMemberPortalSettingsByMember`，与会员 JWT 一致） |
| `src/services/system/` | 与业务弱相关的系统级小工具（如 API 预热） |
| `src/services/lottery/` | 抽奖相关 API |
| `server/src/` | 服务端入口与各业务模块 |
| `docs/` | 补充设计/运维说明 |

## 国际化

界面文案以 **`src/locales/translations.ts`** 为准（`LanguageContext`）。`src/lib/translations.ts` 为遗留占位，请勿新增业务内容。

## 许可与版本

项目私有用途为主；版本号见 `package.json` / `server/package.json`。
