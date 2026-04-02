# 邀请 / 推广链接注册（安全流程）

## 流程

1. 用户打开 `/invite/:code` 或 `/member/register?ref=` / `?code=`。
2. 前端调用 **`POST /api/member/register-init`**，请求体 `{ "code": "<邀请码>" }`。
3. 服务端校验邀请码、租户唯一性、门户「邀请」开关，写入 **`invite_register_tokens`**，返回 **`registerToken`**（明文仅本次响应）与 **`expiresIn`**（秒）。
4. 用户提交手机号、密码后，前端调用 **`POST /api/member/register`**，请求体含 **`registerToken`**（及 `phone`、`password`；可选 `name`、`captcha` 预留）。
5. 服务端在事务内锁定 token 行、`FOR UPDATE`、创建会员、写推荐关系、**将 token 标记已使用**；失败则整单回滚。

## 兼容 RPC

- `POST /api/data/rpc/validate_invite_and_submit` 仍可用，但必须传 **`p_register_token`**（及 `p_invitee_phone`、`p_password`）。**不再接受**仅凭 `p_tenant_id` + `p_code` 注册。

## 数据库

- **`invite_register_tokens`**：一次性凭证（`token_hash` 存 SHA-256，不存明文）。
- **`invite_register_audit`**：init / 成功 / 失败审计（尽力写入）。

## 配置

- `INVITE_REGISTER_TOKEN_TTL_SEC`：凭证有效期（默认 300，范围 120–600）。
- `INVITE_REGISTER_TOKEN_CLEANUP_INTERVAL_MS`：进程内定时清理周期（毫秒），默认 900000（15 分钟），最小 60000。
- `INVITE_REGISTER_TOKEN_PURGE_USED_AFTER_DAYS`：已消费 token 超过多少天可物理删除（默认 90）；设为 `0` 或负数则**只删过期未使用**，不删已消费行。

## 过期 token 清理

- API 进程启动后注册 **`purgeExpiredInviteRegisterTokens`** 定时任务（与活动数据清理等并列）。
- **过期未使用**：`used_at IS NULL AND expires_at < NOW(3)`，分批 `DELETE ... LIMIT 5000`。
- **已消费**（可选）：`used_at` 早于「现在 − N 天」的行删除；注册审计仍以 **`invite_register_audit`** 为准。

## 限流

- `register-init`：`dataRpcPostLimiter`（全 RPC 桶）+ **按「邀请码哈希 + IP」** 的 `memberRegisterInitPerInviteLimiter` + **纯 IP** 的 `memberRegisterInitLimiter`。
- `register`：`dataRpcPostLimiter` + `memberRegisterCompleteLimiter`（与旧 RPC 提交同量级）。

`register-init` 路由上 **先 `validate` 再按码限流**，避免空 body 误占满「空码」桶。

## 说明

当前业务为 **会员邀请码 / 推广码** 拉新，与订单礼品卡 `gift_cards` 库存无直接绑定；若后续需「礼品卡唯一核销注册」，需在服务端增加卡状态机与绑定表，并走同一类「先 init 再提交」模式。
