# API 调试日志说明

排查 API 重构后数据为空问题时，已在以下位置增加调试日志。

## 1. Auth Middleware (`server/src/middlewares/auth.ts`)

| 日志前缀 | 输出内容 |
|----------|----------|
| `[DEBUG auth] Authorization header` | 请求头中 Authorization 是否存在及前缀（不输出完整 token） |
| `[DEBUG auth] JWT verify failed` | JWT 验证失败时的 token 前缀 |
| `[DEBUG auth] req.user` | 解析后的 req.user：id, tenant_id, username, role |

## 2. Knowledge Repository (`server/src/modules/data/repository.ts`)

### listKnowledgeCategoriesRepository
| 日志前缀 | 输出内容 |
|----------|----------|
| `[DEBUG knowledge] listKnowledgeCategories` | tenant_id, isSuperAdmin |
| `[DEBUG knowledge] employees by tenant_id` | 租户员工 ID 列表、Supabase error |
| `[DEBUG knowledge] Supabase query results` | byCreatedBy/byPublic/byNullCreated 的 count 和 error |
| `[DEBUG knowledge] merged categories count` | 合并后分类数量 |
| `[DEBUG knowledge] all categories (no tenant filter)` | 无租户过滤时的 count 和 error |

### listKnowledgeArticlesRepository
| 日志前缀 | 输出内容 |
|----------|----------|
| `[DEBUG knowledge] listKnowledgeArticles` | categoryId, tenant_id, isSuperAdmin |
| `[DEBUG knowledge] articles Supabase query results` | 各查询的 count 和 error |
| `[DEBUG knowledge] articles (no tenant filter)` | 无租户过滤时的 count 和 error |

## 3. Logs Repository (`server/src/modules/data/repository.ts`)

### listOperationLogsRepository
| 日志前缀 | 输出内容 |
|----------|----------|
| `[DEBUG logs] operation_logs employees by tenant_id` | tenantId, empCount, Supabase error |
| `[DEBUG logs] listOperationLogs` | tenant_id, result count, total, Supabase error |

### listLoginLogsRepository
| 日志前缀 | 输出内容 |
|----------|----------|
| `[DEBUG logs] login_logs employees by tenant_id` | tenantId, empCount, Supabase error |
| `[DEBUG logs] listLoginLogs` | tenant_id, result count, Supabase error |

## 4. Database (`server/src/database/index.ts`)

| 日志前缀 | 输出内容 |
|----------|----------|
| `[DEBUG db] SUPABASE_SERVICE_ROLE_KEY` | SET (length=N) 或 MISSING or invalid |

## 排查步骤

1. **启动服务**：`npm run dev` 或 `npm start`，查看 `[DEBUG db]` 确认 SERVICE_ROLE_KEY 已配置
2. **发起请求**：访问公司文档 / 操作日志 / 登录日志接口
3. **查看 auth**：`[DEBUG auth]` 确认 req.user 和 tenant_id 是否正常
4. **查看 knowledge/logs**：`[DEBUG knowledge]` / `[DEBUG logs]` 确认 Supabase 查询结果和 error

## 输出示例

```
[DEBUG db] SUPABASE_SERVICE_ROLE_KEY: SET (length=219)
[DEBUG auth] Authorization header: Bearer eyJhbGciOiJI...
[DEBUG auth] req.user: {"id":"xxx","tenant_id":"yyy","username":"admin","role":"admin"}
[DEBUG knowledge] listKnowledgeCategories tenant_id= yyy isSuperAdmin= false
[DEBUG knowledge] employees by tenant_id: { tenantId: 'yyy', empIds: [...], error: undefined }
[DEBUG knowledge] Supabase query results: { byCreatedBy: { count: 0, error: undefined }, byPublic: { count: 4, error: undefined }, ... }
[DEBUG knowledge] merged categories count: 4
```

## 移除调试日志

排查完成后，可搜索 `[DEBUG` 并删除相关 console.log 行。
