# 发布指南

## 域名与入口说明

| 域名 | 用途 | 根路径 / 行为 |
|------|------|---------------|
| **https://crm.fastgc.cc** | 会员端 | `/` 直接进入会员登录页 |
| **https://admin.crm.fastgc.cc** | 员工后台 | `/` 进入员工仪表盘，`/login` 员工登录 |

**配置员工子域名（Cloudflare）：**

1. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com) → Pages → 选择 `gift-system` 项目
2. 进入 **Custom domains** → **Set up a custom domain**
3. 添加 `admin.crm.fastgc.cc`，按提示完成 DNS 验证
4. 两个域名指向同一部署，应用会根据访问域名自动分流

---

## 当前状态

- **构建**：已成功
- **GitHub**：项目非 git 仓库，需先 `git init` 并添加 remote
- **Cloudflare**：API Token 权限不足，需重新创建

---

## 一、Cloudflare 部署（必做）

当前 Token 缺少 **User -> User Details -> Read** 权限，需新建 Token：

1. 打开 https://dash.cloudflare.com/profile/api-tokens
2. 点击 **Create Token**
3. 选择 **Edit Cloudflare Workers** 模板，或 **Create Custom Token**
4. 确保勾选：
   - **User** → **User Details** → **Read**
   - **Account** → **Cloudflare Pages** → **Edit**
5. 创建后复制 Token，写入 `.env`：
   ```
   CLOUDFLARE_API_TOKEN=你的新Token
   ```
6. 执行部署：
   ```powershell
   npm run deploy:full
   ```

**或使用 OAuth 登录（推荐）：**

```powershell
npx wrangler login
```

浏览器登录后，再执行 `npm run deploy:full`（无需 Token）。

---

## 二、GitHub 推送（可选）

若项目从 zip 下载，需先初始化 git：

```powershell
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/你的用户名/你的仓库.git
git branch -M main
git push -u origin main
```

之后可用 `npm run publish` 推送更新。

---

## 三、一键发布

配置完成后：

```powershell
npm run deploy:full
```

将依次执行：GitHub 推送（如有变更）+ 构建 + Cloudflare 部署。
