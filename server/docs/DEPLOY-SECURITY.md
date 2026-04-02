# 部署与安全（API）

## 会员 JWT（`MEMBER_JWT_SECRET`）

- **生产**（`NODE_ENV=production`）必须设置 `MEMBER_JWT_SECRET`，与员工 `JWT_SECRET` **完全独立**；未设置时进程启动即失败。
- **非生产** 可省略（使用内置开发占位并打警告），或设置 `DEV_MEMBER_JWT_SECRET` / `MEMBER_JWT_SECRET` 保证重启后 token 仍有效。
- 已移除历史上 `JWT_SECRET + '_member'` 等可预测派生，避免两体系密钥关联。

## CSP（`CSP_MODE`）

- 未设置时：**生产默认 `enforce`**，**开发默认 `off`**。
- 可显式设为 `report`（预发收集违规 → `/api/csp-report`）或 `off`。
- 本策略作用于 **本 Node 进程** 通过 Helmet 下发的响应；若 SPA 静态资源由 CDN/Nginx 托管，需在对应层单独配置 CSP。

## 图片上传与 S3

- 设置 `S3_BUCKET` 与 `AWS_REGION`（或 `S3_REGION`）后，**新上传** 写入 S3；对象 **不设公开读 ACL**，桶侧应保持私有。
- **公开图**（`visibility=public`，通常带 `tenant_id`）：仍可通过 `GET /api/upload/image/:id` 由服务端读出并返回（或按需走 CDN，需 OAC/OAI 等，勿整桶公开）。
- **私有图**（无租户等平台素材、`visibility=private`）：匿名不可用固定公网对象 URL；员工鉴权后可 `GET /api/upload/image/:id/presign` 获取短时 **presigned URL**，或由已鉴权的 `GET /api/upload/image/:id` 代理字节流。
- 凭证：环境变量 `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`，或实例/任务 IAM 角色。
- 上线前执行迁移（含 `uploaded_images` 的 `storage_backend`、`s3_key`、`visibility` 等补丁）：见 `npm run migrate:all` 与启动说明。

## 验收核对

| 项 | 预期 |
|----|------|
| 生产缺 `MEMBER_JWT_SECRET` | 启动失败，控制台明确错误 |
| 生产未设 `CSP_MODE` | Helmet CSP 为 enforce |
| S3 启用且对象为 private | 无永久公开对象 URL；私有图需鉴权 + presign 或 API 代理 |

## 后续风险（运维）

- 历史 `tenant_id IS NULL` 行在补丁中会被标为 **private**，若曾有匿名热链会失效，需改为登录后 presign 或带 JWT 请求。
- 多副本部署勿依赖进程内 DB 迁移；生产建议先 `migrate:all` 再滚动发布。
