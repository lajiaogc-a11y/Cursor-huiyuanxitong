# 员工登录 tenant_id 修复报告

## 修复内容

### 1. JWT Payload

登录时 JWT 已包含 `tenant_id`（`server/src/modules/auth/service.ts`）：

```typescript
const payload: JwtPayload = {
  sub: emp.employee_id,
  email: `${emp.username}@system.local`,
  tenant_id: emp.tenant_id ?? undefined,  // 来自 verify_employee_login_detailed RPC
  role: emp.role,
  username: emp.username,
  real_name: emp.real_name,
  status: emp.status,
  is_super_admin: emp.is_super_admin ?? false,
  is_platform_super_admin: isPlatformSuperAdmin,
};
```

### 2. Middleware 解析 JWT

`server/src/middlewares/auth.ts` 将 payload 挂载到 `req.user`：

```typescript
req.user = {
  id: payload.sub,
  tenant_id: payload.tenant_id,
  role: payload.role,
  username: payload.username,
  real_name: payload.real_name,
  status: payload.status,
  is_super_admin: payload.is_super_admin,
  is_platform_super_admin: payload.is_platform_super_admin,
  token,
};
```

### 3. API 查询使用 tenant_id

| API | tenant_id 来源 | 过滤逻辑 |
|-----|----------------|----------|
| GET /api/knowledge/categories | req.user.tenant_id 或 query.tenant_id | 按 created_by IN (租户员工) + visibility=public |
| GET /api/knowledge/articles/:categoryId | 同上 | 同上 |
| GET /api/logs/audit | req.user.tenant_id | operation_logs.operator_id IN (租户员工) |
| GET /api/logs/login | req.user.tenant_id | employee_login_logs.employee_id IN (租户员工) |

### 4. tenant_id 为空时返回错误

普通员工（非平台总管）若 `tenant_id` 为空，返回 400：

```json
{
  "success": false,
  "error": {
    "code": "TENANT_REQUIRED",
    "message": "tenant_id 为空，无法查询公司文档"
  }
}
```

平台总管（`is_platform_super_admin=true`）即使 `tenant_id` 为空，仍可查看全部数据。

### 5. Supabase 使用 SERVICE_ROLE_KEY

`server/src/database/index.ts` 中 `supabaseAdmin` 使用 `config.supabase.serviceRoleKey`，绕过 RLS，可访问全部表。

### 6. 路由认证

- `/api/knowledge/*`、`/api/logs/*` 已添加 `authMiddleware`，必须携带有效 JWT
- `/api/data/knowledge/*`、`/api/data/operation-logs`、`/api/data/login-logs` 已移至 `authMiddleware` 之后，同样需要认证

---

## 数据流说明

```
员工登录
  → verify_employee_login_detailed(用户名, 密码)
  → 返回 tenant_id（来自 employees.tenant_id）
  → JWT 写入 tenant_id
  → 前端存储 token

员工访问公司文档/操作日志/登录日志
  → 请求头 Authorization: Bearer <token>
  → authMiddleware 解析 JWT → req.user.tenant_id
  → Controller 校验 tenant_id（空则 400，平台总管除外）
  → Repository 按 tenant_id 过滤
  → 返回该租户数据
```

---

## 数据库返回数据

- **knowledge_categories**：`created_by IN (租户员工ID)` 或 `visibility = 'public'`
- **knowledge_articles**：同上
- **operation_logs**：`operator_id IN (租户员工ID)`
- **employee_login_logs**：`employee_id IN (租户员工ID)`

平台总管（tenant_id 为空）不按 tenant_id 过滤，返回全量数据。
