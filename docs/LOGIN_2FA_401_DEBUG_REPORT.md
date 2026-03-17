# 登录 2FA 401 错误排查报告

**生成时间**：2026-03-15  
**范围**：`server/src/modules/auth/` 及 verify_employee_login_2fa RPC 调用链

---

## 一、登录流程完整调用链

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. Frontend (Login.tsx)                                                      │
│    - 用户输入 username, password, twoFactorCode                              │
│    - 调用 signIn(username, password, twoFactorCode)                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. AuthContext.signIn                                                       │
│    - 调用 loginApi(username, password, twoFactorCode)                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. authApiService.loginApi                                                   │
│    - apiPost('/api/auth/login', { username, password, twoFactorCode })      │
│    - twoFactorCode 为空时传 undefined，JSON 中可能被省略                      │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. api/client.apiPost                                                       │
│    - fetch(API_BASE + '/api/auth/login', { method: 'POST', body: JSON })    │
│    - 开发环境 API_BASE=''，请求发往当前 origin，由 Vite 代理到 3001          │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. Backend: auth.controller.loginController                                 │
│    - 校验 body.username, body.password 非空                                  │
│    - 调用 loginService(body, clientIp, userAgent)                           │
│    - 若 !result.success → res.status(401).json({ success: false, error })    │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. auth.service.loginService                                                │
│    ① checkEmployeeLoginLockRepository(username)                             │
│    ② verifyEmployeeLoginRepository(username, password)                      │
│    ③ verifyEmployeeLogin2faRepository(username, twoFactorCode)  ← 2FA 校验   │
│    ④ getMaintenanceModeStatusRepository(tenant_id)                          │
│    ⑤ logEmployeeLoginRepository + clearEmployeeLoginFailuresRepository      │
│    ⑥ jwt.sign() → 返回 { success: true, token, user }                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 7. auth.repository.verifyEmployeeLogin2faRepository                        │
│    - supabaseAdmin.rpc('verify_employee_login_2fa', { p_username, p_code })  │
│    - 解析 { data, error } → 返回 { success, required, message }               │
└─────────────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 8. Supabase PostgREST                                                       │
│    - 调用 PostgreSQL 函数 verify_employee_login_2fa(p_username, p_code)     │
│    - 返回 JSON 数组或对象                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 二、verify_employee_login_2fa 调用代码

### 2.1 Repository 层（auth.repository.ts 第 47-61 行）

```javascript
export async function verifyEmployeeLogin2faRepository(
  username: string,
  code?: string | null
): Promise<{ success: boolean; required?: boolean; message?: string }> {
  const { data, error } = await supabaseAdmin.rpc('verify_employee_login_2fa' as never, {
    p_username: username.trim(),
    p_code: code ?? null,
  } as never);
  if (error) return { success: false, message: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  return {
    success: Boolean(row?.success),
    required: Boolean(row?.required),
    message: row?.message,
  };
}
```

### 2.2 参数说明

| 参数       | 来源                    | 传递值                          |
|------------|-------------------------|---------------------------------|
| p_username | params.username         | 字符串，已 trim                 |
| p_code     | params.twoFactorCode     | `undefined` → `null`，空字符串 → `null` |

### 2.3 Supabase 客户端

- **来源**：`server/src/database/index.ts`
- **配置**：`createClient(url, config.supabase.serviceRoleKey, ...)`
- **密钥**：`SUPABASE_SERVICE_ROLE_KEY`（当前可能为 anon key）

---

## 三、RPC 返回值结构

### 3.1 PostgreSQL 函数定义（supabase/migrations/20260408000006）

```sql
RETURNS TABLE(success boolean, message text, employee_id uuid, required boolean)
```

### 3.2 可能返回的行

| 场景                     | success | message              | required |
|--------------------------|---------|----------------------|----------|
| 2FA 未启用/不需要        | true    | NOT_REQUIRED         | false    |
| 用户不存在               | false   | USER_NOT_FOUND       | false    |
| 需要验证码但未提供       | false   | TWO_FACTOR_REQUIRED  | true     |
| 验证码错误               | false   | WRONG_2FA_CODE       | true     |
| 已启用但未配置验证码     | false   | TWO_FACTOR_NOT_CONFIGURED | true |
| 验证码正确               | true    | OK                   | true     |

### 3.3 PostgREST 实际返回格式

- **成功**：`data` 为数组，如 `[{ success: true, message: 'NOT_REQUIRED', employee_id: '...', required: false }]`
- **失败**：`error` 非空，如 `{ message: '...', code: '...', details: '...' }`

### 3.4 Repository 解析逻辑

```javascript
const row = Array.isArray(data) ? data[0] : data;
return {
  success: Boolean(row?.success),   // row 为 undefined 时 → false
  required: Boolean(row?.required),
  message: row?.message,          // row 为 undefined 时 → undefined
};
```

**潜在问题**：

- `data` 为 `[]` 时，`row = undefined`，`success = false`，`message = undefined`
- `data` 为 `null` 时，`row = null`，`row?.success` 为 `undefined`，`success = false`
- RPC 报错时，直接返回 `{ success: false, message: error.message }`，不解析 `data`

---

## 四、401 触发条件

### 4.1 Controller 层（auth.controller.ts 第 20-24 行）

```javascript
if (!result.success) {
  console.log('[Auth] Login failed:', body.username, result.error);
  res.status(401).json({ success: false, error: result.error });
  return;
}
```

**结论**：只要 `loginService` 返回 `success: false`，就会返回 401。

### 4.2 Service 层 2FA 分支（auth.service.ts 第 104-118 行）

```javascript
// 3. 2FA 校验
const twoFactorResult = await verifyEmployeeLogin2faRepository(username, params.twoFactorCode);
if (!twoFactorResult.success) {
  const msg = twoFactorResult.message || '';
  if (msg.includes('TWO_FACTOR_REQUIRED')) {
    return { success: false, error: '需要二次验证码，请输入6位登录验证码' };
  }
  if (msg.includes('WRONG_2FA_CODE')) {
    return { success: false, error: '二次验证码错误，请重试' };
  }
  if (msg.includes('TWO_FACTOR_NOT_CONFIGURED')) {
    return { success: false, error: '该账号已启用二次验证但未配置验证码，请联系管理员' };
  }
  return { success: false, error: '二次验证失败，请稍后重试' };  // ← 兜底
}
```

**401 且提示「二次验证失败，请稍后重试」的条件**：

1. `twoFactorResult.success === false`
2. `msg` 不包含 `TWO_FACTOR_REQUIRED`、`WRONG_2FA_CODE`、`TWO_FACTOR_NOT_CONFIGURED`

---

## 五、可能问题列表

### 5.1 RPC 调用失败（error 非空）

| 现象 | 原因 | message 示例 |
|------|------|---------------|
| 权限不足 | anon 无 EXECUTE 权限 | permission denied for function verify_employee_login_2fa |
| 函数不存在 | 迁移未执行或函数被删除 | function verify_employee_login_2fa does not exist |
| JWT 问题 | 使用 anon key 且权限不足 | JWT expired / invalid |
| 网络/服务异常 | Supabase 不可达 | fetch failed / timeout |

**结果**：`error.message` 通常为英文，不匹配上述关键词，进入兜底分支。

### 5.2 RPC 返回空结果（data 为空或无效）

| 现象 | 原因 | 结果 |
|------|------|------|
| data = [] | 函数未返回行或异常中断 | row = undefined, success = false, message = undefined |
| data = null | PostgREST 异常 | row = null, success = false, message = undefined |

**结果**：`message` 为 `undefined`，不匹配关键词，进入兜底分支。

### 5.3 返回值结构不一致

| 现象 | 原因 | 结果 |
|------|------|------|
| data 为单对象 | PostgREST 配置或版本差异 | `Array.isArray(data) ? data[0] : data` 可正确取到 row |
| 字段名不同 | 如 snake_case vs camelCase | row.success 可能为 undefined |

### 5.4 Supabase 权限

- **GRANT**：`GRANT EXECUTE ON FUNCTION public.verify_employee_login_2fa(text, text) TO anon, authenticated`
- **后端密钥**：使用 `SUPABASE_SERVICE_ROLE_KEY`，若实际为 anon key，则按 anon 权限执行
- **表 RLS**：`employee_login_2fa_settings` 策略为 `USING (false)`，但函数为 `SECURITY DEFINER`，应能绕过 RLS

### 5.5 2FA 配置与逻辑

- 若 `enabled = false` 或无记录，函数应返回 `NOT_REQUIRED`
- 若脚本未生效或连接错误库，`enabled` 可能仍为 `true`，会继续要求 2FA

---

## 六、修复建议

### 6.1 增加 Repository 层日志（建议）

在 `verifyEmployeeLogin2faRepository` 中：

- 当 `error` 非空时，打印 `error.message`、`error.code`
- 当 `data` 为空或 `row` 无效时，打印 `data` 的原始值

便于区分是 RPC 报错还是返回结构异常。

### 6.2 扩展 Service 层错误识别（建议）

在兜底分支前增加对常见错误的识别，例如：

- `permission denied`、`function.*does not exist` → 提示检查 Supabase 配置与迁移
- `message` 为空或 `undefined` → 提示可能是 RPC 返回异常，需查后端日志

### 6.3 验证 Supabase 配置

1. 确认 `SUPABASE_SERVICE_ROLE_KEY` 为真实的 service_role key
2. 在 Supabase SQL Editor 执行：
   ```sql
   SELECT * FROM verify_employee_login_2fa('wangchao', NULL);
   SELECT has_function_privilege('anon', 'verify_employee_login_2fa(text, text)', 'EXECUTE');
   ```

### 6.4 验证 2FA 数据

```sql
SELECT e.username, s.enabled, s.code_hash
FROM employees e
LEFT JOIN employee_login_2fa_settings s ON s.employee_id = e.id
WHERE e.username = 'wangchao';
```

期望：`enabled = false` 或 `s` 为空。

### 6.5 空结果时的兜底处理（建议）

当 `data` 为空或 `row` 无效时，可考虑：

- 将 `message` 设为 `'RPC_RETURNED_EMPTY'` 等固定值
- 在 Service 中识别该值，返回更明确的错误提示，便于排查

---

## 七、总结

| 项目           | 结论                                                                 |
|----------------|----------------------------------------------------------------------|
| 调用链         | 已梳理，无循环，流程线性                                             |
| RPC 调用       | 参数正确，使用 `p_username`、`p_code`                                |
| 返回值解析     | 对 `data` 为空或 `row` 无效时，会得到 `success=false`、`message` 为空 |
| 401 触发       | `loginService` 返回 `success: false` 时由 controller 返回 401       |
| 兜底错误       | `message` 不匹配已知关键词时，统一返回「二次验证失败，请稍后重试」   |
| 最可能根因     | RPC 调用失败（权限/网络）或返回空结果，导致进入兜底分支              |

---

*报告结束。本报告仅用于分析与定位，未修改任何代码。*
