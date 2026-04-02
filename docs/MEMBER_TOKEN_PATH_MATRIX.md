# 会员 / 员工 JWT 与 API 路径矩阵（阶段 B）

前端 `resolveBearerTokenForPath` 与 `src/lib/memberTokenPathMatrix.ts` 同源；后端抽奖提交见 `requireMemberJwt` + 双层限流。

## 1. Bearer 选择规则（摘要）

| 条件 | 使用的 token |
|------|----------------|
| `path` 以 `/api/auth/` 开头 | 仅 `api_access_token`（员工） |
| 邀请/预览类公开路径（见代码 `isPublicMemberOnboardingPath`） | 仅 `member_access_token` |
| 当前路由为 `/member*` 或 `/invite*`，或 API 为 `/api/member-auth*`、`/api/data/rpc/member_*`，或 **`POST /api/lottery/draw`** | **优先** `member_access_token`，无则回退员工再回退会员 |

## 2. 会员门户 HTTP / RPC 登记

唯一路径常量：`src/services/memberPortal/routes.ts`（`MEMBER_AUTH_PATHS`、`MEMBER_LOTTERY_PATHS`、`MEMBER_POINTS_HTTP_PATHS`、`MEMBER_PORTAL_RPC_PATHS`）。

## 3. 抽奖后端（MemberSpin / draw）

| 层级 | 说明 |
|------|------|
| `authMiddleware` | 解析员工或会员 JWT |
| `requireMemberJwt` | **仅会员**可调用 `POST /api/lottery/draw`（员工 JWT → 403 `MEMBER_JWT_REQUIRED`） |
| `lotteryDrawBurstLimiter` | 每会员 **5 次 / 10 秒** |
| `lotteryDrawLimiter` | 每会员 **15 次 / 60 秒** |
| `lottery/service.draw` | 事务 + `GET_LOCK` + 短时 `DUPLICATE_REQUEST` 防抖 |

## 4. 变更时检查清单

- 新增会员域 API：更新 `routes.ts`；若需「永远优先会员 token」，在 `memberTokenPathMatrix.ts` 扩展规则。
- 新增敏感写操作：评估是否需 `requireMemberJwt` 或独立限流。
