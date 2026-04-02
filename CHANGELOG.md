# 更新日志

## 未发布

### 后端
- **`GET /api/data/settings/ip-access-control` / `ip-country-check`**：改为经独立 **`publicSettingsRouter`** 挂在 **`/api/data/settings`**，先于主 `data` 路由注册，避免被 `router.use(authMiddleware)` 误判为需登录（`smoke-api` 与登录前 IP 校验恢复 200）。

### 会员端「我的订单」卡名显示
- **原因**：`order_type` 存礼品卡 UUID；会员域不加载 `gift_cards` 表缓存，`resolveCardName` 无法解析，界面只剩一长串 ID（易被误认为乱码）。
- **后端**：`member_get_orders` 对 `gift_cards` **LEFT JOIN**，返回 **`gift_card_name`**。
- **前端**：`MemberPortalOrderView.cardDisplayName` 优先展示卡名，并对展示串做 **`tryRecoverMisdecodedUtf8`** 兜底。

### 前端（员工域「无样式 / 像乱码」）
- **Pages Middleware**：SPA 回退（如 `/staff/login`）响应强制 **`Cache-Control: no-cache, no-store`**，避免边缘缓存旧 `index.html` 引用已删除的 hashed CSS。
- **`public/_headers`**：`/assets/*` 增加 **`Access-Control-Allow-Origin: *`**，兼容 Vite 对 CSS 的 CORS 请求。
- **Vite**：构建后去掉主 **`stylesheet` link 的 `crossorigin`**，降低 CDN 未返回 CORS 时整站 CSS 被拒的概率。
- **`index.html`**：`manifest` / `apple-touch-icon` 改为**根路径** `/...`，避免深链下相对路径解析到 `/staff/...`。
- **`theme-init.js` + `main.tsx`**：更早注销 **Service Worker** 并 `await` 清理后再 `render`，减轻旧缓存脚本劫持静态资源。

### 阶段 B（会员 JWT 路径矩阵 + 抽奖限流）
- **前端**：`src/lib/memberTokenPathMatrix.ts` 集中登记 Bearer 选择规则；`apiClient.resolveBearerTokenForPath` 与之对齐；**`POST /api/lottery/draw` 始终优先会员 token**（防双 token 误带员工 JWT）。
- **后端**：`POST /api/lottery/draw` 增加 **`requireMemberJwt`**（员工 JWT → 403 `MEMBER_JWT_REQUIRED`）；叠加 **`lotteryDrawBurstLimiter`（5 次/10 秒/会员）** 与原有分钟级 **`lotteryDrawLimiter`（15 次/分）**。
- **文档**：`docs/MEMBER_TOKEN_PATH_MATRIX.md`；**smoke**：`SMOKE_STAFF_TOKEN` 时校验员工调用 draw 返回 403。

### MySQL 整站迁移
- **API**：`GET /api/admin/database/mysql-dump?mode=full|schema|data`（`mysqldump` 流式下载）；权限：平台总管理或租户 admin+`is_super_admin`；冷却 `DUMP_MIN_INTERVAL_MS`；审计 `operation_logs`。
- **前端**：系统设置 → 数据导入导出 →「MySQL 完整备份」+ curl 复制；原 ZIP 导出标为兼容/旧逻辑。
- **文档**：`docs/MYSQL-MIGRATION-DUMP-RESTORE.md`、`docs/ARCHITECTURE-DEDUP-AUDIT.md`；`server/.env.example` 增加 `MYSQLDUMP_PATH` 等说明。

### 前端 SPA / 缓存
- **站内导航**：`spaNavigate` + `SpaNavigationBridge`，401、IP 强制登出、会员登录成功等改为 **React Router** 跳转，避免整页刷新。
- **布局**：`LayoutContext` 切换「强制电脑端布局」不再 `location.reload()`。
- **订单跳转**：积分流水 / 会员活动页跳转统一为 **`/staff/orders`**（原 `/order-management` 无路由）。
- **React Query**：默认 `queries.retry: 2`、`mutations.retry: 1`；员工 **signOut** 执行 **`queryClient.clear()`**；会员 signOut / 会员 401 仅 **`removeQueries({ queryKey: ['member'] })`**，不误清员工端缓存。
- **文档**：`docs/SPA-ROUTING-QUERY-AUDIT.md`（路由/缓存/安全/E2E 清单）；**单元测试** `src/lib/spaNavigation.test.ts`；`npm run test:unit`。

## 1.1.2 — 2025-03-22

### 时区（全站北京时间）
- **MySQL2**：默认 `timezone: +08:00`，连接建立时 `SET time_zone = '+08:00'`；修正订单等 `created_at` 经 API 返回后显示 **快 8 小时**（原 `+00:00` 误解析北京时间 DATETIME）。
- **Node**：未设置 `TZ` 时默认 `Asia/Shanghai`（可用 `APP_TIMEZONE` 覆盖）。
- **服务端「今日」**：抽奖/报表等改用 **上海日历日**（`server/src/lib/shanghaiTime.ts`）。
- **前端**：普通订单创建后 `createdAt` 使用 **`formatBeijingTime`**（与 USDT 一致）。

### 运维 / 安全
- **生产 `TRUST_PROXY=1`**：`app.ts` 启用 trust proxy 时打确认日志；未设置时打 **warn** 提醒反代后限流不准。
- **本地验证日志**：`VERIFY_TRUST_PROXY=1` + `TRUST_PROXY=1`（仍为 `development`）可启用 trust proxy 并打印联调说明；`npm run start:verify-trust-proxy-dev`。模拟生产：`npm run start:verify-trust-proxy`（须配 `CORS_ALLOWED_ORIGINS` 含本地前端）。
- **`server/.env.example`**：补充 `TRUST_PROXY=1` 说明。
- **抽奖 HTTP**：会员 JWT 仅可查本人 `quota/logs/prizes`；员工须带 URL `memberId`（`lottery/controller.ts`）。

### 文档
- **`docs/mysql-member-spin-mysql-only.md`**：会员端自测表、`spin_credits` 核对、生产 `TRUST_PROXY` 说明。

---

版本号：根目录与 `server/package.json` 均为 **1.1.2**。

## 1.1.1 — 2025-03-20

### 后端
- **限流**：员工登录/注册、会员登录、`POST /api/data/rpc/*` 使用 `express-rate-limit`；生产环境在反代后需 `TRUST_PROXY=1` 以正确识别客户端 IP。
- **分享领抽奖**：`member_grant_spin_for_share` 幂等（同日仅一次）、校验 `member_id`、按 `member_portal_settings.share_reward_spins` 发放；错误码含 `SHARE_REWARD_DISABLED`、`ALREADY_CLAIMED_TODAY`。

### 前端 / 配置
- **外部 URL**：`SUPABASE_EDGE_FUNCTIONS` + `buildSupabaseEdgeUrl`（与 `EXTERNAL_API` 同文件维护）；`AuthContext`、`useLoginLogs`、`ApiDocumentationTab` 等已改用。
- **汇率页**：防重复提交改为组件内 `useRef`，避免模块级状态跨实例串扰。
- **动态 chunk 失败**：`main.tsx` 重载次数上限（最多 2 次），避免无限刷新。
- **会员端**：分享领奖接口返回 `SHARE_REWARD_DISABLED` 时友好提示。
- **`useMembers`**：`updateMemberByPhoneAsync` 标注 `@deprecated`，建议改用 `await updateMemberByPhone`。

### 文档
- `docs/REFACTOR-API-TYPES-REPORTS.md` 补充 Edge slug 与常量说明。

### 补充（MySQL：会员抽奖与配额统一）
- **`member_get_spin_quota` / `GET /api/points/member/:id/spin-quota`**：与 **`/api/lottery/quota`** 同源逻辑（`lottery_logs` 当日次数 + `spin_credits` + 每日免费次数）。
- **`member_spin` RPC**：改为调用 **`lottery` 的 `draw()`**，只写 **`lottery_logs`**，不再插入旧 **`spins`** 表。
- **每日免费次数**：`lottery_settings.daily_free_spins` 优先；若无配置行则回退 **`member_portal_settings.daily_free_spins_per_day`**。发布门户或保存抽奖后台设置时 **双向同步** 两处的每日次数字段。
- **`member_get_spins`**：返回 **`lottery_logs`**（与转盘页记录一致）。
- **签到**：响应增加 **`credits_granted`**（实发整数次）；前端对小数配置展示「约 X 次（已计入 N 次）」。
- **分享成功文案**：按接口返回的 **`credits`** 显示次数。
- **P0 安全**：`member_grant_spin_for_share` 事务内 **`members` 行锁 + 当日重复校验 + 写入**；路由叠加 **`memberGrantSpinShareLimiter`（20 次/分钟/IP）**；门户 **`daily_share_reward_limit > 0`** 时校验当日分享发放总次数上限；会员端处理 **`SHARE_DAILY_CAP_REACHED` / 429 限流**。
- **汇率页**：模块级变量仅作汇率缓存说明注释；下单仍用组件内 **`isSubmittingOrderRef`**。

---

版本号：`package.json` 与 `server/package.json` 均为 **1.1.1**。

## 1.1.0 — 2025-03-20

### 后端
- **积分流水**：统一通过 `pointsLedgerAccount` 写入 `points_ledger`，补齐 `account_id`、`balance_after`，并同步更新 `points_accounts`，修复 `Field 'account_id' doesn't have a default value`。
- **消费/推荐积分**：解析会员时，`consumption` 优先使用订单 `member_id`，推荐类仍按推荐人手机/编号解析，避免绑错人。
- **抽奖 / 积分商城 / 订单回滚**：抽奖加分、商城兑换/退款、取消订单回滚等路径与上述逻辑对齐。
- **会员更新**：支持按手机号更新 `member_code`，同租户内编号冲突返回 409（`MEMBER_CODE_TAKEN`）。
- **签到**（MySQL）：`member_check_in` 奖励写入 `spin_credits`，与 `/api/lottery/quota` 统计一致。

### 前端
- **汇率计算页**：已存在会员时 **`await` 保存会员资料后再下单**；支持修改会员编号并落库；保存失败时中止提交。
- **会员 hooks**：`updateMemberByPhone` 映射 `memberCode` → `member_code`，成功后刷新 `members` 查询；编号占用时提示。
- **会员端**：公告弹窗居中、去重复关闭按钮、样式优化；积分/活动等相关页面调整（见提交记录）。

### 数据库
- 建议已部署环境执行仓库内 **`mysql/fix_schema.mjs`** 或 **`mysql/fix_columns.sql`**，确保 `points_ledger` 扩展列齐全。

---

1.1.0 发布时：`package.json` 与 `server/package.json` 均为 **1.1.0**。
