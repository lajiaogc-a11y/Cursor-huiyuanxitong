# Cloudflare Pages 发布指南

## 项目信息

| 项目 | 值 |
|------|-----|
| CF 邮箱 | edwin.doe567@gmail.com |
| Account ID | a6fa9e34e1c8653d73bb0d5d6dfbb785 |
| Pages 项目名 | gift-system |
| 发布目录 | dist |
| 域名 | https://crm.fastgc.cc |

---

## ⚠️ 重要：API Token 与 Global API Key 区别

**Wrangler 需要的是 API Token，不是 Global API Key！**

- **Global API Key**：40 位十六进制，在 My Profile → API Keys 中
- **API Token**：较长字符串，在 My Profile → API Tokens 中创建

---

## 获取 API Token 步骤

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 右上角头像 → **My Profile**
3. 左侧 **API Tokens** → **Create Token**
4. 选择 **Edit Cloudflare Workers** 模板，或自定义：
   - **Account** → **Cloudflare Pages** → **Edit**
5. 点击 **Continue to summary** → **Create Token**
6. **复制 Token**（只显示一次，请妥善保存）

---

## 部署方式

### 方式一：使用部署脚本（推荐）

```powershell
# 设置 Token 后执行
$env:CLOUDFLARE_API_TOKEN = "你的API_Token"
.\deploy-cf.ps1
```

### 方式二：手动命令

```powershell
# 1. 构建
npm run build

# 2. 部署（需先设置环境变量）
$env:CLOUDFLARE_API_TOKEN = "你的API_Token"
$env:CLOUDFLARE_ACCOUNT_ID = "a6fa9e34e1c8653d73bb0d5d6dfbb785"
npx wrangler pages deploy dist --project-name=gift-system
```

### 方式三：Git 集成（自动部署）

在 Cloudflare Pages 控制台连接 GitHub/GitLab 仓库，每次 push 自动构建部署。

---

## 安全提醒

- **切勿**将 API Token 提交到 Git 或分享给他人
- 建议使用环境变量或 CI/CD 密钥存储
- 若 Token 已泄露，请立即在 Cloudflare 控制台撤销并重新创建
