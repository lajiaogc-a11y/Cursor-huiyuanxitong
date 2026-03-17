# 登录 2FA 401 根因报告

**生成时间**：2026-03-15  
**状态**：已定位并修复

---

## 一、登录调用链

```
Frontend (Login.tsx)
  → signIn(username, password, twoFactorCode)
  → loginApi() → apiPost('/api/auth/login')
  → Vite 代理 → localhost:3001/api/auth/login

Backend (auth.controller)
  → loginController → loginService
  → verifyEmployeeLoginRepository (密码)
  → verifyEmployeeLogin2faRepository (2FA)
    → supabaseAdmin.rpc('verify_employee_login_2fa', { p_username, p_code })
    → Supabase PostgREST → PostgreSQL 函数

PostgreSQL
  → verify_employee_login_2fa(p_username, p_code)
  → 返回 TABLE(success, message, employee_id, required)
```

---

## 二、RPC 返回日志（修复前）

### 诊断脚本直接调用 RPC 时

```
error: column reference "employee_id" is ambiguous
code: 42702
detail: It could refer to either a PL/pgSQL variable or a table column.
internalQuery: SELECT * FROM public.employee_login_2fa_settings WHERE employee_id = v_employee.id
where: PL/pgSQL function verify_employee_login_2fa(text,text) line 17 at SQL statement
```

**结论**：RPC 执行时抛出 SQL 错误，Supabase 返回 `error` 非空，后端收到 `error.message`，不匹配已知关键词，进入兜底「二次验证失败，请稍后重试」。

---

## 三、SQL 函数结构

### 3.1 问题根因

`verify_employee_login_2fa` 使用 `RETURNS TABLE(success, message, employee_id, required)`，在 PL/pgSQL 中会创建同名输出变量。

表 `employee_login_2fa_settings` 也有列 `employee_id`。

在以下语句中：
```sql
SELECT * INTO v_setting
FROM public.employee_login_2fa_settings
WHERE employee_id = v_employee.id  -- employee_id 歧义
```

`employee_id` 既可指 RETURNS TABLE 的输出变量，也可指表列，PostgreSQL 无法区分，报错 `42702`。

### 3.2 修复方案

为表添加别名，显式限定列名：

```sql
SELECT s.* INTO v_setting
FROM public.employee_login_2fa_settings s
WHERE s.employee_id = v_employee.id
LIMIT 1;
```

### 3.3 修复后函数返回结构

```
RETURNS TABLE: success boolean, message text, employee_id uuid, required boolean
```

---

## 四、2FA 表数据

### 4.1 employee_login_2fa_settings（注：表名为 employee_login_2fa_settings，非 employee_2fa）

| 字段 | wangchao 当前值 |
|------|-----------------|
| enabled | false |
| code_hash | 有值（已脱敏） |
| updated_at | 2026-03-15 |

**结论**：wangchao 的 2FA 已关闭，RPC 应返回 `NOT_REQUIRED`。

---

## 五、根因分析

| 项目 | 结论 |
|------|------|
| 根因 | `verify_employee_login_2fa` 中 `employee_id` 列引用歧义，导致 SQL 执行失败 |
| 错误码 | PostgreSQL 42702 (ambiguous_column) |
| 影响 | RPC 返回 error，后端收到英文错误信息，进入兜底分支 |
| 权限 | anon 有 EXECUTE 权限，非权限问题 |
| 2FA 配置 | wangchao 已关闭 2FA，配置正常 |

---

## 六、修复方案

### 6.1 已执行

1. **新增迁移**：`supabase/migrations/20260408000016_fix_verify_employee_login_2fa_ambiguous.sql`
2. **修改内容**：在 `employee_login_2fa_settings` 上使用表别名 `s`，将 `WHERE employee_id` 改为 `WHERE s.employee_id`
3. **执行方式**：`node scripts/run-fix-verify-2fa-ambiguous.mjs`

### 6.2 修复后验证

```
SELECT * FROM verify_employee_login_2fa('wangchao', NULL);
→ success: true, message: 'NOT_REQUIRED', required: false
```

---

## 七、验证步骤

1. 重启后端（若未自动重载）：`cd server && npm run dev`
2. 使用 wangchao + 正确密码登录
3. 确认：登录成功、JWT 生成、前端跳转正常

---

*报告结束。根因已修复。*
