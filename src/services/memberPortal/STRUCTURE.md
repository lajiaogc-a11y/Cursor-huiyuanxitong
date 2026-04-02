# 会员门户 services 结构（第二阶段：业务与 UI 分离）

## 路径登记

- `routes.ts` — `MEMBER_AUTH_PATHS`、`MEMBER_LOTTERY_PATHS`、`MEMBER_POINTS_HTTP_PATHS`、`MEMBER_PORTAL_RPC_PATHS`

## 门面模块（页面 / hooks 优先引用）

| 模块 | 职责 |
|------|------|
| `memberLotteryPageService.ts` | 抽奖页：加载奖品+次数、记录、九宫格筛选、执行抽奖 |
| `memberPointsPortalService.ts` | 积分余额/明细、商城目录、兑换记录、兑换动作 |
| `memberInvitePortalService.ts` | 邀请 token、邀请链接拼接 |
| `memberDailyTasksPortalService.ts` | 签到 / 分享领奖 RPC（再导出 `memberActivityService`） |
| `memberProfilePortalService.ts` | `memberGetInfo`（会话刷新） |

## 底层实现（路径已由 routes 统一）

- `memberActivityService.ts` — RPC 体
- `memberAuthService.ts` — 登录 / 改密 / info
- `../lottery/lotteryService.ts` — 抽奖 REST
- `../points/memberPointsRpcService.ts` — 积分 REST + RPC 回退

## 统一入口

- HTTP/RPC：`@/api/client`（`apiGet` / `apiPost`）+ `routes.ts` 常量
- 聚合导出：`memberPortal/index.ts`（门面 + `memberGetInfo`）
