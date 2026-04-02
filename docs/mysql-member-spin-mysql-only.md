# MySQL 部署：会员签到 / 分享 / 抽奖次数（非 Supabase）

本仓库 **Node + MySQL + `tableProxy`** 已统一策略，**无需**在 Supabase 改 SQL 函数。

## 行为摘要

| 能力 | 实现位置 |
|------|----------|
| 签到发抽奖次数 | `POST /api/data/rpc/member_check_in` → 写入 `spin_credits`（`source=check_in`） |
| 分享发次数 | `POST /api/data/rpc/member_grant_spin_for_share` → 事务 + 当日幂等 + 限流 |
| 剩余次数（首页与转盘一致） | `GET /api/lottery/quota/:memberId` → `lottery_logs` 当日次数 + `spin_credits` + 每日免费（`lottery_settings` 优先，否则门户 `daily_free_spins_per_day`） |
| 转盘抽奖 | `POST /api/lottery/draw` → `lottery_logs` |
| RPC 兼容 | `member_get_spin_quota` / `member_spin` 与上述 lottery 逻辑对齐（MySQL） |

## 部署后操作

1. **重启 Node API**（启动时会跑 `migrateLotteryTables()` 等，补 `member_points_mall_items.title` 等列）。
2. 生产在反向代理后若要用 **限流真实 IP**：设置 **`TRUST_PROXY=1`**（与 `app.ts` 一致）。

## 时区（北京时间）

- 连接池使用 **`MYSQL_TIMEZONE=+08:00`**（默认），并对每条连接执行 **`SET time_zone = '+08:00'`**，使 `NOW()` / `CURDATE()` 与库内 `DATETIME`（按北京时间存）一致；避免以前 `+00:00` 把北京时间误当 UTC，JSON 带 `Z` 后前端再解析 **快 8 小时**。
- 未设置 **`TZ`** 时，进程会将 **`TZ=APP_TIMEZONE`**（默认 `Asia/Shanghai`）。详见 `server/.env.example`。

## 可选自检 SQL

```sql
-- 今日某会员分享/签到发放的次数（整数条）
SELECT id, member_id, amount, source, created_at
FROM spin_credits
WHERE member_id = 'YOUR_MEMBER_UUID'
ORDER BY created_at DESC
LIMIT 20;

-- 今日已用抽奖次数（与 API 统计一致）
SELECT COUNT(*) FROM lottery_logs
WHERE member_id = 'YOUR_MEMBER_UUID' AND DATE(created_at) = CURDATE();

SHOW COLUMNS FROM member_portal_settings LIKE 'daily_free%';
SHOW COLUMNS FROM lottery_settings;
```

## 验证步骤（浏览器自测）

| 步骤 | 预期 |
|------|------|
| 1. 会员登录 | JWT 写入 `member_access_token` |
| 2. **签到**（门户开启签到） | `spin_credits` 新增 `source=check_in`；接口返回 `credits_granted` |
| 3. 看首页快捷入口「剩余 N 次」 | 来自 **`useMemberSpinQuota` → `GET /api/lottery/quota/:memberId`** |
| 4. **分享领奖**（门户开启分享奖励） | `spin_credits` 新增 `source=share`；同日第二次为 `ALREADY_CLAIMED_TODAY` |
| 5. 打开 **转盘页** `/member/spin` | 顶部剩余次数与 **首页数字一致**（同源 `getLotteryQuota`） |
| 6. 在转盘 **抽奖一次** | `lottery_logs` 增 1 条；剩余次数减 1 |

**生产在 CDN/反代后**：环境变量 **`NODE_ENV=production`** 且 **`TRUST_PROXY=1`**，否则限流按代理 IP 聚合；启动成功应看到日志 `trust proxy enabled (TRUST_PROXY=1)`。

### 可选：用 SQL 核对 `spin_credits`

签到/分享后执行（替换 `YOUR_MEMBER_UUID`）：

```sql
SELECT id, amount, source, created_at
FROM spin_credits
WHERE member_id = 'YOUR_MEMBER_UUID'
ORDER BY created_at DESC
LIMIT 15;
```
