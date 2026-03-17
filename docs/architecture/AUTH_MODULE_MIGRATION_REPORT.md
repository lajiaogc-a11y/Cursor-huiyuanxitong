# Auth 模块 Supabase → API 迁移报告

> 完成时间：2025-03  
> 阶段：第七阶段 - Auth 模块迁移

---

## 一、迁移范围说明

Auth 模块涉及：

- **supabase.auth.signInWithPassword**：员工登录
- **supabase.auth.signOut**：登出
- **supabase.auth.getSession**：获取会话
- **supabase.auth.onAuthStateChange**：会话变更监听
- **supabase.auth.getUser**：获取当前用户

---

## 二、已迁移文件列表

| 文件 | 变更 |
|------|------|
| `src/services/auth/authApiService.ts` | **新增**，封装 loginApi、logoutApi、getCurrentUserApi |
| `src/contexts/AuthContext.tsx` | signIn → loginApi，signOut → logoutApi，init → hasAuthToken + getCurrentUserApi |
| `src/api/client.ts` | getAuthToken 仅从 localStorage 读取，新增 hasAuthToken |
| `src/pages/Login.tsx` | 移除 isSupabaseConfigured 提示 |
| `src/pages/Signup.tsx` | signup_employee RPC → apiPost /api/auth/register |
| `src/hooks/useSessionExpiration.ts` | supabase.auth → getCurrentUserApi 定期校验 |
| `src/services/members/operatorService.ts` | supabase.auth.getUser → getCurrentUserApi |
| `src/services/userDataSyncService.ts` | supabase.auth.getUser → getCurrentUserApi |
| `src/stores/shiftHandoverStore.ts` | supabase.auth.getUser → getCurrentOperatorSync |
| `src/services/phonePoolService.ts` | supabase.auth.getUser → getCurrentUserApi |
| `src/components/ErrorBoundary.tsx` | supabase.auth.getUser → getCurrentUserApi |
| `server/src/modules/auth/jwt.ts` | **新增**，JWT 验证工具 |
| `server/src/modules/auth/repository.ts` | 重写，verify_employee_login_detailed 等 RPC |
| `server/src/modules/auth/service.ts` | 重写，login/register/verifyToken/getMe |
| `server/src/modules/auth/controller.ts` | 重写，login/register/logout/me |
| `server/src/modules/auth/routes.ts` | 新增 /login、/register、/logout、/me |
| `server/src/middlewares/auth.ts` | Supabase auth.getUser → JWT verify |
| `server/src/modules/orders/repository.ts` | JWT 时使用 supabaseAdmin + tenant_id 查询 |
| `server/src/modules/orders/controller.ts` | tenantId 回退到 req.user.tenant_id |

---

## 三、替换调用数量

| 类型 | 替换前 | 替换后 |
|------|--------|--------|
| supabase.auth.signInWithPassword | 3 | 0 |
| supabase.auth.signOut | 4 | 0 |
| supabase.auth.getSession | 2 | 0 |
| supabase.auth.onAuthStateChange | 2 | 0 |
| supabase.auth.getUser | 5 | 0 |
| **合计** | **16** | **0** |

---

## 四、新 API 列表

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | 登录（username, password, twoFactorCode?），返回 JWT + user |
| POST | /api/auth/register | 注册（username, password, realName, invitationCode?） |
| POST | /api/auth/logout | 登出（客户端清除 token 即可） |
| GET | /api/auth/me | 获取当前用户（需 Bearer token） |

---

## 五、JWT 认证

- **库**：jsonwebtoken
- **格式**：`Authorization: Bearer <token>`
- **Payload**：`{ sub: employee_id, email, tenant_id, role, username, iat, exp }`
- **有效期**：7 天
- **密钥**：`JWT_SECRET` 环境变量（默认 fallback-secret-change-in-production）

---

## 六、剩余 Supabase 调用（Auth 相关）

| 文件 | 调用 | 说明 |
|------|------|------|
| AuthContext.tsx | checkIpAccess (data_settings)、logLoginAttempt (RPC) | IP 校验、登录日志，仍用 supabase |
| Signup.tsx | employees、currencies 表 | checkFirstUser、checkNetwork |
| 其他 | supabase.from、supabase.rpc | 非 Auth，属其他模块 |

---

## 七、Supabase SDK 清理说明

**未删除** `src/integrations/supabase`：项目中仍有大量模块使用 `supabase.from()`、`supabase.rpc()`（如 tenantService、DataManagementTab、useReportData 等），需待后续模块迁移完成后再移除 Supabase SDK。

---

## 八、修改的 Hooks / 数据流

| 数据流 | 变更 |
|--------|------|
| AuthContext | 完全迁移至 API，init 用 hasAuthToken + getCurrentUserApi |
| useSessionExpiration | 定期调用 getCurrentUserApi 校验会话 |
| operatorService | fetchCurrentOperator 使用 getCurrentUserApi |
| userDataSyncService | getCurrentUserId 使用 getCurrentUserApi |
| shiftHandoverStore | 使用 getCurrentOperatorSync |
| phonePoolService | getMyReservedPhones 使用 getCurrentUserApi |
| ErrorBoundary | 使用 getCurrentUserApi 获取 employee_id |

---

## 九、系统验证结果

| 验证项 | 状态 |
|--------|------|
| 前端构建 | ✅ 通过 |
| 后端构建 | ✅ 通过 |
| 登录 | 待运行时验证 |
| 登出 | 待运行时验证 |
| Token 认证 | 待运行时验证 |
| 注册 | 待运行时验证 |
| 会话恢复（刷新页面） | 待运行时验证 |

**验证步骤**：
1. 配置 `JWT_SECRET`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 等环境变量
2. 启动后端：`cd server && npm run dev`
3. 启动前端：`npm run dev`（确保 VITE_API_BASE 指向后端，默认 http://localhost:3001）
4. 测试登录、登出、刷新后会话恢复、注册

---

## 十、依赖说明

- **后端**：仍使用 Supabase 数据库（employees、profiles 等）及 RPC（verify_employee_login_detailed、check_employee_login_lock 等）
- **前端**：Token 存于 localStorage（key: api_access_token），401 时 onUnauthorized 清除并跳转登录
- **phone_pool.reserved_by**：原为 Supabase auth.uid()，现改为 employee_id；若数据库仍存 auth user id，需数据迁移或 RPC 调整
