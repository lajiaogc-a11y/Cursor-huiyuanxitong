# 本地运行配置指南

## 登录失败常见原因

### 1. 未配置 Supabase Service Role Key（最常见）

后端登录需要 **SUPABASE_SERVICE_ROLE_KEY**，不能使用 anon key。

**操作步骤：**

1. 打开 [Supabase 控制台](https://supabase.com/dashboard)
2. 选择项目 `dhlwefrcowefvbxutsmc`
3. 进入 **Settings** → **API**
4. 在 **Project API keys** 中找到 **service_role**（注意：这是私密密钥，勿泄露）
5. 点击 **Reveal** 复制密钥
6. 编辑 `server/.env`，将 `SUPABASE_SERVICE_ROLE_KEY=` 后面替换为复制的密钥

```env
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRobHdlZnJjb3dlZnZieHV0c21jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDcyMzAzMywiZXhwIjoyMDg2Mjk5MDMzfQ.xxxxx
```

7. 重启后端：`cd server && npm run dev`

### 2. 后端未启动

确保后端在 3001 端口运行：

```powershell
cd server
npm run dev
```

### 3. 前端未重启（修改 vite 配置后）

修改 `vite.config.ts` 后需重启前端：

```powershell
npm run dev
```

### 4. 账号或密码错误

确认用户名、密码正确。若账号启用了 2FA，需输入管理员设置的 6 位验证码。

### 5. 公司文档、操作日志、登录日志为空

这些功能依赖后端 API（`/api/data/*`）。若后端未启动或不可达，会显示「加载失败」和重试按钮。

- **本地开发**：必须先启动后端 `cd server && npm run dev`，再访问前端
- **生产部署**：若前后端分离，需在构建时设置 `VITE_API_BASE` 指向后端地址

**数据库有数据但页面看不到时**：请确认 `server/.env` 中的 `SUPABASE_URL` 与你在 Supabase 控制台查看的是同一项目。后端通过该配置读取数据。可调用 `GET /api/data/data-debug`（需登录）查看后端能读取到的各表记录数。

**公司文档无分类时**：页面会显示「初始化默认分类」按钮，管理员或经理点击即可。若点击后仍失败（如 tenant_id 错误），请按 **docs/FIX_KNOWLEDGE_CATEGORIES.md** 在 Supabase SQL Editor 中执行修复 SQL。

### 6. 生产环境显示「Internal Server Error」或「服务器异常」

- **同源部署**：前端与后端在同一域名下（如通过反向代理将 /api 转发到后端）时，无需额外配置。
- **前后端分离**：若后端部署在独立域名，需在构建时设置 `VITE_API_BASE` 指向后端地址，例如：
  ```env
  VITE_API_BASE=https://your-api.example.com
  ```
- **Supabase 配置**：确保 `server/.env` 中 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 正确，且使用的是 **service_role** 密钥。
