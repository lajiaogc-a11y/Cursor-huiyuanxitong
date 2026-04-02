# 公司文档 / 操作日志 / 登录日志 - API 修复说明

## 1. API 路径（统一通过 /api 访问）

| 功能     | 路径                         | 说明           |
|----------|------------------------------|----------------|
| 公司文档分类 | GET /api/knowledge/categories | 不要求认证     |
| 公司文档文章 | GET /api/knowledge/articles/:categoryId | 不要求认证 |
| 操作日志 | GET /api/logs/audit           | 不要求认证，支持 page/pageSize 等查询参数 |
| 登录日志 | GET /api/logs/login           | 不要求认证，支持 ?limit=500 |

## 2. 数据库表名（Supabase）

- `knowledge_categories` - 公司文档分类
- `knowledge_articles` - 公司文档文章
- `operation_logs` - 操作日志（非 audit_logs）
- `employee_login_logs` - 登录日志

## 3. 检查数据库是否有数据

在 Supabase SQL Editor 执行：

```sql
SELECT COUNT(*) FROM knowledge_categories;
SELECT COUNT(*) FROM operation_logs;
SELECT COUNT(*) FROM employee_login_logs;
```

若 knowledge_categories 为空，可执行：

```bash
npm run db:seed-knowledge-migration
```

## 4. 验证 API

启动后端后，浏览器访问：

- http://localhost:3001/api/knowledge/categories
- http://localhost:3001/api/logs/audit?page=1&pageSize=10
- http://localhost:3001/api/logs/login?limit=100

返回 `[]` 表示数据库为空；返回 JSON 数组/对象表示正常。

## 5. 环境变量

确保 `server/.env` 配置：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## 6. 调试日志

后端会在控制台输出：

- `[API] HIT /api/knowledge/categories`
- `[API] getKnowledgeCategories`
- `[API] HIT /api/logs/audit`
- `[API] getOperationLogs`
- `[API] HIT /api/logs/login`
- `[API] getLoginLogs`
