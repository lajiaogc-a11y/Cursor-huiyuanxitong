# API 调试报告

> 生成时间：扫描项目后自动生成

---

## 1. /api 路由检查

### 1.1 已存在的 API 路由

| 挂载路径 | 模块 | 说明 |
|---------|------|------|
| `/api/auth` | auth | 登录、注册、登出、/me |
| `/api/members` | members | 会员 CRUD |
| `/api/points` | points | 积分、spin 配额 |
| `/api/giftcards` | giftcards | 礼品卡、商家、支付商 |
| `/api/orders` | orders | 订单 |
| `/api/whatsapp` | whatsapp | 聊天 |
| `/api/reports` | reports | 报表 |
| `/api/admin` | admin | 管理操作 |
| `/api/tenants` | tenants | 租户 |
| `/api/member-portal-settings` | memberPortalSettings | 会员门户设置 |
| `/api/phone-pool` | phonePool | 号码池 |
| `/api/data` | data | 操作日志、公司文档、登录日志、权限等 |
| `/api/knowledge` | knowledge | 公司文档（分类、文章） |
| `/api/logs` | logs | 操作日志、登录日志 |
| `/api/member-auth` | memberAuth | 会员登录 |

### 1.2 公司文档 / 操作日志 / 登录日志 相关路由

| 完整路径 | 方法 | 认证 | 说明 |
|---------|------|------|------|
| `/api/knowledge/categories` | GET | 否 | 公司文档分类 |
| `/api/knowledge/articles/:categoryId` | GET | 否 | 公司文档文章 |
| `/api/logs/audit` | GET | 否 | 操作日志（分页） |
| `/api/logs/login` | GET | 否 | 登录日志 |
| `/api/data/knowledge/categories` | GET | 否 | 同上（兼容） |
| `/api/data/knowledge/articles/:categoryId` | GET | 否 | 同上（兼容） |
| `/api/data/operation-logs` | GET | 否 | 同上（兼容） |
| `/api/data/login-logs` | GET | 否 | 同上（兼容） |
| `/api/data/seed-knowledge` | POST | 是 | 初始化默认分类 |
| `/api/data/operation-logs` | POST | 是 | 写入操作日志 |

**结论：所有相关 /api 路由均存在。**

---

## 2. knowledge_categories 初始化逻辑

### 2.1 存在的初始化方式

| 方式 | 入口 | 说明 |
|-----|------|------|
| RPC 函数 | `rpc_seed_knowledge_categories` | Supabase 迁移中定义 |
| 迁移脚本 | `npm run db:seed-knowledge-migration` | 直接连库执行 RPC |
| REST 种子 | `npm run db:seed-knowledge` | 调用 Supabase REST RPC |
| API 接口 | POST `/api/data/seed-knowledge` | 需管理员登录 |
| 迁移 SQL | `20260419000000_seed_knowledge_categories_if_empty.sql` | 表空时插入默认 4 条 |
| 初始迁移 | `20260130120633` | 建表时 INSERT 4 条默认分类 |

### 2.2 默认分类

- 公司通知 (text)
- 行业知识 (text)
- 兑卡指南 (image)
- 常用话术 (phrase)

**结论：knowledge_categories 有完整的初始化逻辑。**

---

## 3. audit_logs 表

**结论：项目中不存在 `audit_logs` 表。**

- 存在 `audit_records` 表：用于审核流程（create/update/delete 审批）
- 操作日志使用 `operation_logs` 表

**命名对应关系：**

| 任务/文档中的名称 | 实际表名 |
|-----------------|---------|
| audit_logs | **operation_logs** |
| login_logs | **employee_login_logs** |

---

## 4. login_logs 表

**结论：项目中不存在 `login_logs` 表。**

- 实际表名：`employee_login_logs`
- 字段：id, employee_id, success, failure_reason, ip_address, user_agent, login_time 等

---

## 5. 前端 Hooks 与 API 调用

### 5.1 公司文档 (KnowledgeBase)

| Hook/来源 | 数据获取 | 调用链 |
|-----------|---------|--------|
| useKnowledgeCategories | getKnowledgeCategories | ✅ api/data.ts → apiClient.get(`/api/knowledge/categories`) |
| useKnowledgeArticles | getKnowledgeArticles | ✅ api/data.ts → apiClient.get(`/api/knowledge/articles/:id`) |

**结论：公司文档的「读取」已正确走 API。**

### 5.2 操作日志 (OperationLogs 页面)

| 来源 | 数据获取 | 调用链 |
|------|---------|--------|
| OperationLogs 页面 | fetchAuditLogsPage | ✅ auditLogStore → getOperationLogsApi → apiGet(`/api/logs/audit`) |

**结论：操作日志页面正确调用 API。**

### 5.3 登录日志 (LoginLogs 页面)

| Hook | 数据获取 | 调用链 |
|------|---------|--------|
| useLoginLogs | fetchLoginLogs | ✅ getLoginLogs → apiClient.get(`/api/logs/login`) |

**结论：登录日志正确调用 API。**

### 5.4 其他相关 Hook（仍用 Supabase）

| Hook | 用途 | 说明 |
|------|------|------|
| useOperationLogs | 全量列表、添加、恢复 | ⚠️ 直接 supabase.from('operation_logs')，非 OperationLogs 页面主数据源 |
| auditLogStore.initializeAuditLogCache | 缓存初始化 | ⚠️ 直接 supabase.from('operation_logs') |
| auditLogStore.refreshAuditLogCache | 刷新缓存 | ⚠️ 直接 supabase.from('operation_logs') |

---

## 6. 仍存在的 Supabase 直连

### 6.1 公司文档 / 操作日志 / 登录日志 相关

| 文件 | 用途 | 说明 |
|------|------|------|
| useKnowledge.ts | addCategory, updateCategory, deleteCategory | 写操作直连 Supabase（当前页面已简化为只读，这些可能未使用） |
| useKnowledge.ts | addArticle, updateArticle, deleteArticle | 同上 |
| auditLogStore.ts | initializeAuditLogCache, refreshAuditLogCache | 缓存初始化/刷新直连 |
| auditLogStore.ts | fetchAuditLogsPage 失败时 | 有 Supabase 回退逻辑（throw 后不会执行） |
| useOperationLogs.ts | fetchOperationLogsFromDb, addLog, restoreLog | 全量拉取、写入、恢复直连 |

### 6.2 其他模块（非本次范围）

大量 RPC、from() 调用分布在：memberPointsRpcService、ledgerTransactionService、sharedDataService、taskService、employeeStore 等。

---

## 7. API 调用链（公司文档 / 操作日志 / 登录日志）

### 7.1 公司文档

```
KnowledgeBase.tsx
  └─ useKnowledgeCategories()
       └─ getKnowledgeCategories() [api/data.ts]
            └─ apiClient.get('/api/knowledge/categories')
                 └─ GET /api/knowledge/categories
                      └─ getKnowledgeCategoriesController
                           └─ listKnowledgeCategoriesRepository
                                └─ supabaseAdmin.from('knowledge_categories').select('*')

  └─ useKnowledgeArticles(categoryId)
       └─ getKnowledgeArticles() [api/data.ts]
            └─ apiClient.get('/api/knowledge/articles/:categoryId')
                 └─ GET /api/knowledge/articles/:categoryId
                      └─ getKnowledgeArticlesController
                           └─ listKnowledgeArticlesRepository
                                └─ supabaseAdmin.from('knowledge_articles').select('*')
```

### 7.2 操作日志

```
OperationLogs.tsx
  └─ useQuery → fetchAuditLogsPage() [auditLogStore.ts]
       └─ getOperationLogsApi() [dataApiService.ts]
            └─ apiGet('/api/logs/audit?page=1&pageSize=50&...')
                 └─ GET /api/logs/audit
                      └─ getOperationLogsController
                           └─ listOperationLogsRepository
                                └─ supabaseAdmin.from('operation_logs').select('*')
```

### 7.3 登录日志

```
LoginLogs.tsx
  └─ useLoginLogs()
       └─ fetchLoginLogs() → getLoginLogs() [api/data.ts]
            └─ apiClient.get('/api/logs/login?limit=500')
                 └─ GET /api/logs/login
                      └─ getLoginLogsController
                           └─ listLoginLogsRepository
                                └─ supabaseAdmin.from('employee_login_logs').select('*')
```

---

## 8. 问题与建议

### 8.1 表名澄清

- 任务中的 `audit_logs` → 实际为 `operation_logs`
- 任务中的 `login_logs` → 实际为 `employee_login_logs`

### 8.2 仍使用 Supabase 直连的部分

- `useOperationLogs`：若仍被使用，建议改为通过 API
- `auditLogStore` 的缓存初始化/刷新：可考虑改为调用 API
- `useKnowledge` 的增删改：当前页面已简化为只读，若未来恢复编辑，建议通过 API

### 8.3 验证步骤

1. 启动后端：`cd server && npm run dev`
2. 访问：
   - http://localhost:3001/api/knowledge/categories
   - http://localhost:3001/api/logs/audit?page=1&pageSize=10
   - http://localhost:3001/api/logs/login?limit=100
3. 若返回 `[]`，检查数据库表是否有数据
4. 若 401/500，检查 `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`

---

## 9. 总结

| 检查项 | 状态 |
|--------|------|
| 1. 所有 /api 路由是否存在 | ✅ 存在 |
| 2. knowledge_categories 是否有初始化逻辑 | ✅ 有 |
| 3. audit_logs 表是否存在 | ❌ 不存在（使用 operation_logs） |
| 4. login_logs 表是否存在 | ❌ 不存在（使用 employee_login_logs） |
| 5. 前端 hooks 是否正确调用 API | ✅ 公司文档、操作日志、登录日志主流程已走 API |
| 6. 是否仍存在 Supabase 直连 | ⚠️ 部分存在（useOperationLogs、auditLogStore 缓存、useKnowledge 写操作） |
| 7. API 调用链 | ✅ 已输出 |
