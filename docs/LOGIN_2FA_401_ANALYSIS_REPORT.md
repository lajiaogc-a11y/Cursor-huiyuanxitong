# 登录 401 + 二次验证失败 分析报告

## 一、现象

- **HTTP 状态**：401 Unauthorized
- **前端提示**：二次验证失败，请稍后重试
- **场景**：wangchao 账号已执行 `disable-employee-2fa.mjs` 关闭 2FA，但仍出现上述错误

---

## 二、请求链路（无循环）

```
用户点击登录
    → 前端 apiPost('/api/auth/login', { username, password, twoFactorCode })
    → Vite 代理转发到 localhost:3001/api/auth/login
    → 后端 loginController
    → loginService 依次执行：
        1. checkEmployeeLoginLockRepository (检查锁定)
        2. verifyEmployeeLoginRepository (验证密码)
        3. verifyEmployeeLogin2faRepository (验证 2FA)  ← 失败点
        4. getMaintenanceModeStatusRepository (维护模式)
        5. 生成 JWT、返回成功
    → 若失败：res.status(401).json({ success: false, error: result.error })
    → 前端 handleResponseError 解析 body.error，抛出 ApiError
    → AuthContext signIn 捕获，返回 { success: false, message }
    → Login 页显示 message
```

**结论**：流程为线性，无重试、无循环。401 是登录失败后的正常返回。

---

## 三、错误来源定位

"二次验证失败，请稍后重试" 来自 `server/src/modules/auth/service.ts` 第 117 行：

```javascript
// 3. 2FA 校验
const twoFactorResult = await verifyEmployeeLogin2faRepository(username, params.twoFactorCode);
if (!twoFactorResult.success) {
  const msg = twoFactorResult.message || '';
  if (msg.includes('TWO_FACTOR_REQUIRED')) { ... }
  if (msg.includes('WRONG_2FA_CODE')) { ... }
  if (msg.includes('TWO_FACTOR_NOT_CONFIGURED')) { ... }
  return { success: false, error: '二次验证失败，请稍后重试' };  // ← 兜底分支
}
```

即：`verifyEmployeeLogin2faRepository` 返回 `success: false`，且 `message` 不包含上述任一关键词时，会走该兜底分支。

---

## 四、Repository 层逻辑

`server/src/modules/auth/repository.ts`：

```javascript
const { data, error } = await supabaseAdmin.rpc('verify_employee_login_2fa', {
  p_username: username.trim(),
  p_code: code ?? null,
});
if (error) return { success: false, message: error.message };  // ← 情况 A
const row = Array.isArray(data) ? data[0] : data;
return {
  success: Boolean(row?.success),   // ← 情况 B：row 为空则 success=false
  required: Boolean(row?.required),
  message: row?.message,
};
```

导致 `success: false` 的两种情况：

| 情况 | 条件 | 返回的 message |
|------|------|----------------|
| **A** | Supabase RPC 报错 (`error` 非空) | `error.message`（如 permission denied、function not found 等） |
| **B** | RPC 成功但 `data` 为空或 `row` 无 `success` | `undefined` |

---

## 五、根因分析（按可能性排序）

### 1. Supabase RPC 调用失败（最可能）

- **表现**：`error` 非空，`message` 为 Supabase/PostgREST 错误文案
- **可能原因**：
  - anon 角色无 `verify_employee_login_2fa` 执行权限
  - 函数签名不匹配（如 GRANT 为 `(text, text)`，实际调用方式不同）
  - 网络或 Supabase 服务异常
- **为何显示“二次验证失败”**：错误文案通常不含 `TWO_FACTOR_REQUIRED` 等关键词，落入兜底分支

### 2. RPC 返回空结果（次可能）

- **表现**：`data` 为 `[]` 或 `null`，`row` 为 `undefined`
- **可能原因**：
  - 函数内部异常，未执行到 `RETURN QUERY`
  - RLS 或权限导致函数无法读取 `employee_login_2fa_settings`
- **为何显示“二次验证失败”**：`row?.success` 为 `false`，`message` 为 `undefined`，同样落入兜底

### 3. 数据库未按预期更新（需核实）

- **表现**：`employee_login_2fa_settings` 中 wangchao 的 `enabled` 仍为 `true`
- **可能原因**：
  - 脚本连接的是其他环境/项目
  - 事务未提交或连接到了只读副本
- **为何仍走 2FA**：函数读到 `enabled = true`，会继续要求 2FA 校验

### 4. 函数签名与 GRANT 不一致

- **函数定义**：`verify_employee_login_2fa(p_username text, p_code text DEFAULT NULL)`
- **GRANT**：`verify_employee_login_2fa(text, text)`
- **说明**：DEFAULT 不改变参数类型，签名仍为 `(text, text)`，一般不会导致权限问题，但需在数据库中确认实际函数签名

---

## 六、验证建议（不修改代码）

1. **查后端日志**  
   登录失败时应有：`[Auth] Login failed: wangchao 二次验证失败，请稍后重试`  
   若能看到更早的 Supabase 报错，可帮助区分是 RPC 错误还是业务逻辑错误。

2. **在 Supabase SQL Editor 中直接调用 RPC**  
   ```sql
   SELECT * FROM verify_employee_login_2fa('wangchao', NULL);
   -- 或
   SELECT * FROM verify_employee_login_2fa('wangchao', '');
   ```  
   - 若返回 `success=true, message='NOT_REQUIRED'`：说明 RPC 逻辑正常，问题在调用方式或权限。
   - 若报错：说明权限或函数定义有问题。

3. **确认 2FA 配置**  
   ```sql
   SELECT e.username, s.enabled, s.code_hash
   FROM employees e
   LEFT JOIN employee_login_2fa_settings s ON s.employee_id = e.id
   WHERE e.username = 'wangchao';
   ```  
   - 期望：`enabled = false` 或 `s` 为空。

4. **检查 RPC 权限**  
   ```sql
   SELECT has_function_privilege('anon', 'verify_employee_login_2fa(text, text)', 'EXECUTE');
   ```  
   - 期望：`true`。

---

## 七、总结

| 项目 | 结论 |
|------|------|
| 是否存在循环 | 否，流程为线性，无重试、无循环 |
| 401 是否异常 | 否，登录失败时返回 401 是预期行为 |
| 错误来源 | 2FA 校验失败，且 `message` 未命中已知分支 |
| 最可能根因 | Supabase RPC 调用失败（权限或函数签名），返回 `error`，`message` 落入兜底 |

---

*报告生成时间：2026-03-15*
