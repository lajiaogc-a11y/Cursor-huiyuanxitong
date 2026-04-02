# 发布指南（AWS EC2）

## 域名与入口说明

| 域名 | 用途 | 根路径 / 行为 |
|------|------|---------------|
| **https://crm.fastgc.cc** | 会员端 | `/` 直接进入会员登录页 |
| **https://admin.crm.fastgc.cc** | 员工后台 | `/` 进入员工仪表盘，`/login` 员工登录 |

---

## 一键发布

```powershell
npm run deploy:full
# 或带提交信息
.\scripts\deploy-full.ps1 "你的提交信息"
```

将依次执行：**GitHub 推送** → **Server tsc 构建** → **Vite 前端构建 + SCP 上传到 EC2** → **Server 上传 + PM2 重启**。

数据库 schema 迁移已整合到 `npm run migrate:all`（`server/src/startup/migrateSchemaPatches.ts`），服务启动时自动执行。

---

## 部署前提

在 `.env` 中配置 EC2 连接信息：

```env
DEPLOY_PM2_SSH=ubuntu@52.65.141.204
DEPLOY_REMOTE_DIR=/var/www/gc-app
```

确保本机 SSH Key 已添加到 EC2 authorized_keys。

---

## 服务器架构

- **Nginx**：监听 443，`root /var/www/gc-app/dist`，前端 SPA + `/api/` 反向代理到 Node :3001
- **Node.js (PM2)**：后端 API，端口 3001
- **DNS**：可在域名注册商或任意 DNS 服务商配置 A 记录指向 EC2 公网 IP；与 Cloudflare 无绑定关系
