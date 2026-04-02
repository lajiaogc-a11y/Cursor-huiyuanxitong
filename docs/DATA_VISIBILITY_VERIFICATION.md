# 数据可见性验证报告

## 一、后端 API 数据访问状态

| 模块 | 接口 | tenant_id 要求 | 无 tenant_id 时 | 状态 |
|------|------|----------------|-----------------|------|
| **订单** | GET /api/orders, /full, /usdt-full | 无 | 返回全部 | ✅ 可见全部 |
| **会员** | GET /api/members, GET /api/members/:id | 无 | 返回全部 | ✅ 可见全部 |
| **会员** | POST/PUT/DELETE /api/members | 必填 | 403 | ⚠️ 写操作需 tenant_id |
| **操作日志** | GET /api/logs/audit | 无 | 返回全部 | ✅ 可见全部 |
| **登录日志** | GET /api/logs/login | 无 | 返回全部 | ✅ 可见全部 |
| **公司文档** | GET /api/knowledge/categories, /articles/:id | 无 | 返回全部 | ✅ 可见全部 |
| **礼品卡** | GET /api/giftcards/cards, vendors, providers | 无 | 返回全部 | ✅ 可见全部 |
| **报表** | GET /api/reports/dashboard, orders, activity-gifts | 无 | tenantId=null 时返回全平台 | ✅ 可见全部 |
| **积分** | GET /api/points/member/:id | 无 | 按 memberId 查 | ✅ 可见 |
| **租户** | GET /api/tenants | 无 | 仅平台总管可访问 | ✅ 符合设计 |
| **号码池** | GET/POST /api/phone-pool/* | 必填 | 400 | ⚠️ 需 tenant_id |

## 二、结论

### ✅ 所有员工可看到的数据（读操作）

- **订单**：全部订单
- **会员**：全部会员（列表、详情）
- **操作日志**：全部
- **登录日志**：全部
- **公司文档**：全部分类、文章
- **礼品卡**：卡片、卡商、支付渠道
- **报表**：仪表盘、订单报表、活动礼品报表
- **积分**：按会员 ID 查询

### ⚠️ 仍需 tenant_id 的操作

| 操作 | 说明 |
|------|------|
| 会员 创建/更新/删除/批量创建 | 需 `req.user.tenant_id`，否则 403 |
| 号码池 全部接口 | 需 `tenant_id`（query 或 body），否则 400 |

### 三、前端数据来源说明

部分页面仍存在**前端直连 Supabase**，与后端 API 并行：

| 页面/功能 | 数据来源 | 说明 |
|-----------|----------|------|
| 知识库 | API `/api/knowledge/*` + 部分 useKnowledge 直连 | 若 API 有数据，应能显示 |
| 操作日志 | API `/api/logs/audit` + auditLogStore 直连 | 存在双轨，可能不一致 |
| 登录日志 | API `/api/logs/login` | 统一走 API |
| 订单 | API `/api/orders/*` | 统一走 API |
| 会员 | API `/api/members` | 统一走 API |
| 租户管理 | tenantService 直连 Supabase RPC | 未走 /api/tenants |

若某页面**仍看不到数据**，可能原因：

1. **前端使用 Supabase 直连**：受 RLS 限制，anon key 可能返回空
2. **未携带 JWT**：API 需认证，未登录或 token 失效会 401
3. **数据库本身无数据**：表为空

---

*验证时间：基于当前代码静态分析*
