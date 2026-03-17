# 后端部署指南 - 解决登录「接口不存在」问题

前端部署在 Cloudflare Pages (crm.fastgc.cc)。**推荐先部署 Edge Function 备用登录**，无需单独部署后端即可登录。

## 方案 A：Supabase Edge Function 备用登录（推荐，无需后端）

当后端未部署时，前端会自动使用 Supabase Edge Function 登录。

### 1. 部署 Edge Functions

```powershell
supabase login   # 首次需登录
npm run deploy:edge-auth
```

### 2. 设置 JWT 密钥（若后端 server 使用自定义 JWT_SECRET）

```powershell
supabase secrets set JWT_SECRET=你的密钥
```

### 3. 重新部署前端

```powershell
npm run deploy:full
```

完成以上步骤后，生产环境即可登录。

---

## 方案 B：部署完整后端到 Render

## 一、部署后端到 Render（免费）

### 1. 注册并连接 GitHub

1. 打开 https://render.com 注册
2. 连接你的 GitHub 仓库

### 2. 创建 Web Service

1. 点击 **New** → **Web Service**
2. 选择本仓库
3. 配置：
   - **Name**: `gift-system-api`
   - **Root Directory**: `server`
   - **Runtime**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Instance Type**: Free

### 3. 配置环境变量（必填）

在 Render 的 **Environment** 中添加：

| 变量名 | 说明 | 获取方式 |
|--------|------|----------|
| `SUPABASE_URL` | Supabase 项目 URL | Supabase 控制台 → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key | Supabase 控制台 → Settings → API → service_role |
| `SUPABASE_ANON_KEY` | Anon Key | Supabase 控制台 → Settings → API |
| `DATABASE_PASSWORD` | 数据库密码 | Supabase 控制台 → Settings → Database |
| `JWT_SECRET` | JWT 签名密钥 | 任意随机字符串（如 `openssl rand -hex 32`） |

### 4. 部署

点击 **Create Web Service**，等待部署完成。部署成功后 URL 类似：`https://gift-system-api.onrender.com`

---

## 二、配置前端指向后端

### 1. 在项目根目录创建/编辑 `.env`

```env
VITE_API_BASE=https://gift-system-api.onrender.com
```

（将 `gift-system-api` 替换为你在 Render 上创建的服务名）

### 2. 重新部署前端

```powershell
npm run deploy:full
```

---

## 三、验证

1. 打开 https://crm.fastgc.cc
2. 使用员工账号登录（如 admin / 你的密码）
3. 若能正常进入，说明配置成功

---

## 常见问题

**Q: 部署后首次登录很慢？**  
A: Render 免费版 15 分钟无流量会休眠，首次请求需约 1 分钟唤醒。

**Q: 登录仍提示「接口不存在」？**  
A: 确认 `.env` 中 `VITE_API_BASE` 已正确设置，且执行了 `npm run deploy:full` 重新构建。

**Q: 登录提示「后端配置错误」？**  
A: 检查 Render 环境变量是否正确，特别是 `SUPABASE_SERVICE_ROLE_KEY` 必须是 service_role（不是 anon）。
