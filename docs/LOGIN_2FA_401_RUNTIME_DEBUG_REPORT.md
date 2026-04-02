# 登录 2FA 401 运行时调试报告

**生成时间**：2026-03-15  
**用途**：配合新增调试日志，定位 401 +「二次验证失败」根因

---

## 一、RPC 请求参数

### 1.1 调用位置

`server/src/modules/auth/repository.ts` → `verifyEmployeeLogin2faRepository`

### 1.2 参数结构

```typescript
{
  p_username: string,   // 用户名，已 trim
  p_code: string | null // 二次验证码，空时传 null
}
```

### 1.3 日志输出

```
[Auth RPC request] { username: 'wangchao', code: null }
```

- `code: null`：未填写二次验证码
- `code: '***'`：已填写（脱敏）

---

## 二、RPC 返回 data

### 2.1 正常返回（PostgreSQL RETURNS TABLE）

```json
[
  {
    "success": true,
    "message": "NOT_REQUIRED",
    "employee_id": "uuid",
    "required": false
  }
]
```

或单对象（视 PostgREST 版本）：

```json
{
  "success": true,
  "message": "NOT_REQUIRED",
  "employee_id": "uuid",
  "required": false
}
```

### 2.2 日志输出

```
[Auth RPC response data] [ { success: true, message: 'NOT_REQUIRED', ... } ]
```

或

```
[Auth RPC response data] null
[Auth RPC response data] []
```

### 2.3 空结果处理

当 `!data || (Array.isArray(data) && data.length === 0)` 时：

- 打印：`[Auth RPC Empty Result] <data 原始值>`
- 返回：`{ success: false, message: 'RPC_RETURNED_EMPTY' }`

---

## 三、RPC 返回 error

### 3.1 结构

```typescript
{
  message: string,
  code?: string,
  details?: string
}
```

### 3.2 日志输出

```
[Auth RPC response error] { message: 'permission denied for function...', code: '42501' }
```

或

```
[Auth RPC response error] null
```

### 3.3 常见 error 示例

| message | 可能原因 |
|---------|----------|
| permission denied for function verify_employee_login_2fa | anon 无 EXECUTE 权限 |
| function public.verify_employee_login_2fa does not exist | 函数未创建或已删除 |
| JWT expired | 密钥过期 |
| ... | 网络、Supabase 服务异常等 |

---

## 四、result.success 解析过程

### 4.1 Repository 层

```typescript
const row = Array.isArray(data) ? data[0] : data;
return {
  success: Boolean(row?.success),
  required: Boolean(row?.required),
  message: row?.message,
};
```

### 4.2 解析结果

| data 状态 | row | success | message |
|------------|-----|---------|---------|
| `[{ success: true, message: 'NOT_REQUIRED' }]` | 第一项 | true | NOT_REQUIRED |
| `[]` | undefined | - | 已提前返回 RPC_RETURNED_EMPTY |
| `null` | - | - | 已提前返回 RPC_RETURNED_EMPTY |
| error 非空 | - | false | error.message |
| `[{ success: false, message: 'WRONG_2FA_CODE' }]` | 第一项 | false | WRONG_2FA_CODE |

---

## 五、401 触发条件

### 5.1 Controller（loginController）

```typescript
if (!result.success) {
  console.log('[Auth] Login failed:', body.username, result.error);
  res.status(401).json({ success: false, error: result.error });
  return;
}
```

### 5.2 触发路径

1. `loginService` 返回 `{ success: false, error: '...' }`
2. 2FA 分支中任一条件成立：
   - `!msg` → RPC 返回异常：message 缺失
   - `msg.includes('TWO_FACTOR_REQUIRED')` → 需要二次验证码
   - `msg.includes('WRONG_2FA_CODE')` → 二次验证码错误
   - `msg.includes('TWO_FACTOR_NOT_CONFIGURED')` → 未配置验证码
   - `msg.includes('RPC_RETURNED_EMPTY')` → RPC 返回空结果
   - 其他 → 二次验证失败，请稍后重试

---

## 六、最终根因分析

### 6.1 根据日志定位

| 日志组合 | 推断根因 |
|----------|----------|
| `[Auth RPC response error]` 非 null | Supabase RPC 调用失败（权限、函数、网络等） |
| `[Auth RPC Empty Result]` 出现 | RPC 成功但返回空，函数未返回行或异常 |
| `[Auth 2FA Failed]` 且 message 为英文 | error.message 未匹配已知关键词，进入兜底 |
| `[Auth 2FA Failed]` 且 message 为空 | row 无效或 message 未解析，现已单独处理 |
| `[Auth 2FA Failed]` 且 message 为 RPC_RETURNED_EMPTY | 空结果分支已触发 |

### 6.2 可能根因汇总

1. **RPC 权限**：anon 无 `verify_employee_login_2fa` 执行权限
2. **RPC 返回空**：函数未返回行或执行异常
3. **Supabase 密钥**：使用 anon key 且权限不足
4. **2FA 配置**：`enabled` 仍为 true，但验证码校验异常
5. **网络/服务**：Supabase 不可达或超时

### 6.3 调试步骤

1. 重启后端，触发一次登录失败
2. 查看终端输出：
   - `[Auth RPC request]`：确认参数
   - `[Auth RPC response data]`：确认返回结构
   - `[Auth RPC response error]`：确认是否有错误
   - `[Auth RPC Empty Result]`：是否出现空结果
   - `[Auth 2FA Failed]`：完整 result
3. 根据上述日志判断具体根因

---

*报告结束。调试日志已加入 repository.ts 与 service.ts。*
