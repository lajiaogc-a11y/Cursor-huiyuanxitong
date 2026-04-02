# Data Management 模块 Supabase → API 迁移报告

> 完成时间：2025-03  
> 阶段：第九阶段 - Data Management 模块迁移

---

## 一、迁移范围说明

Data Management 模块涉及：

- **DataManagementTab.tsx**：数据删除/归档主界面
- **supabase.from**：orders、members、points_ledger、activity_gifts、member_activity、points_accounts、referral_relations、ledger_transactions、balance_change_logs、shared_data_store、shift_handovers、shift_receivers、audit_records、operation_logs、employee_login_logs、knowledge_articles、knowledge_categories
- **supabase.rpc**：verify_employee_login（密码验证）

---

## 二、迁移清单（扫描结果）

### 2.1 调用文件

| 文件 | Supabase 调用 |
|------|---------------|
| DataManagementTab.tsx | from(orders/members/points_ledger/activity_gifts/member_activity/points_accounts/referral_relations/ledger_transactions/balance_change_logs/shared_data_store/shift_handovers/shift_receivers/audit_records/operation_logs/employee_login_logs/knowledge_articles/knowledge_categories) |
| DataManagementTab.tsx | rpc(verify_employee_login) |

### 2.2 查询表

| 表 | 操作 |
|----|------|
| orders | select(id)、delete、update(member_id) |
| members | select(id,member_code)、delete |
| points_ledger | delete、update(order_id/member_id) |
| activity_gifts | delete、update(member_id) |
| member_activity | delete、update(member_id) |
| points_accounts | delete |
| referral_relations | delete |
| ledger_transactions | delete |
| balance_change_logs | delete |
| shared_data_store | delete |
| shift_handovers | delete |
| shift_receivers | delete |
| audit_records | delete |
| operation_logs | delete |
| employee_login_logs | delete |
| knowledge_articles | delete |
| knowledge_categories | delete |

### 2.3 删除逻辑

- 按 retainMonths 计算 cutoffDate，或 deleteAll（retainMonths=0）
- 收集订单 ID、会员 ID 按 cutoff 分批
- 按外键依赖顺序：points_ledger → activity_gifts → member_activity → points_accounts → orders.member_id 解绑 → orders → referral_relations → ledger_transactions/balance_change_logs → shared_data_store → members → shift_handovers/shift_receivers → audit_records → operation_logs → employee_login_logs → knowledge_articles → knowledge_categories

### 2.4 归档逻辑

- 归档 = 按时间保留的批量删除（非软删除）
- 支持 preserveActivityData（保留积分数据）
- 支持 recycleActivityDataOnOrderDelete（后端暂未实现，前端 pointsService 依赖）

---

## 三、已迁移文件列表

| 文件 | 变更 |
|------|------|
| `server/src/modules/admin/types.ts` | **新增**，BulkDeleteSelections、BulkDeleteRequest、BulkDeleteResult |
| `server/src/modules/admin/repository.ts` | **新增**，verifyAdminPasswordRepository、bulkDeleteRepository、deleteOrderByIdRepository、deleteMemberByIdRepository |
| `server/src/modules/admin/service.ts` | **新增**，封装 repository |
| `server/src/modules/admin/adminMiddleware.ts` | **新增**，role === 'admin' 校验 |
| `server/src/modules/admin/controller.ts` | **新增**，verifyPassword、bulkDelete、archiveOrders、archiveMembers、deleteOrder、deleteMember |
| `server/src/modules/admin/routes.ts` | **新增**，GET/POST/DELETE 路由 |
| `server/src/middlewares/auth.ts` | 增加 username 到 req.user |
| `server/src/app.ts` | 挂载 /api/admin |
| `src/services/admin/adminApiService.ts` | **新增**，verifyAdminPasswordApi、bulkDeleteApi、archiveOrdersApi、archiveMembersApi、deleteOrderApi、deleteMemberApi |
| `src/components/DataManagementTab.tsx` | handleDeleteData → bulkDeleteApi，verify_employee_login → verifyAdminPasswordApi |

---

## 四、新 API 列表

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/admin/verify-password | 验证管理员密码 |
| POST | /api/admin/bulk-delete | 批量删除（DataManagementTab 主流程） |
| POST | /api/admin/archive-orders | 归档订单（简化） |
| POST | /api/admin/archive-members | 归档会员（简化） |
| DELETE | /api/admin/orders/:id | 删除单个订单 |
| DELETE | /api/admin/members/:id | 删除单个会员 |

**认证**：所有接口需 `authMiddleware` + `adminMiddleware`（role === 'admin'）。

---

## 五、Supabase 调用替换情况

| 文件 | 替换前 | 替换后 |
|------|--------|--------|
| DataManagementTab | supabase.rpc('verify_employee_login') | verifyAdminPasswordApi() |
| DataManagementTab | handleDeleteData 内全部 supabase.from/delete/update | bulkDeleteApi() |

**说明**：侧栏导航配置（原 `navigation_config`）已下线，文案由代码内中英文与权限模块 `navigation` 控制。

---

## 六、安全控制

| 控制 | 实现 |
|------|------|
| JWT 验证 | authMiddleware |
| 角色校验 | adminMiddleware（role === 'admin'） |
| 密码二次确认 | bulk-delete/archive 需传 password，后端 verify_employee_login |

---

## 七、租户隔离

- 租户管理员（tenant_id 非空）：仅可删除本租户 orders、members
- 平台管理员（tenant_id 为空）：可删除全平台数据

---

## 八、已知限制

| 项 | 说明 |
|----|------|
| recycleActivityDataOnOrderDelete | 原逻辑调用 reversePointsOnOrderCancel，依赖前端 pointsService，后端暂未实现 |
| merchantSettlement.initialBalances | 卡商/代付结算的 loadSharedData、saveSharedData 重置逻辑依赖 sharedDataService RPC，后端仅删除 shared_data_store 中相关 key |
| 报表数据 | reports.employee/card/vendor/daily 删除逻辑未迁移（原 DataManagementTab 无对应实现） |

---

## 九、系统验证结果

| 验证项 | 状态 |
|--------|------|
| 前端构建 | ✅ 通过 |
| 后端构建 | ✅ 通过 |
| 数据删除 | 待运行时验证 |
| 数据归档 | 待运行时验证 |
| 数据管理页面 | 待运行时验证 |

**验证步骤**：
1. 启动后端：`cd server && npm run dev`
2. 启动前端：`npm run dev`
3. 登录管理员账号，进入系统设置 → 数据归档 → 打开删除数据对话框，选择要删除的数据类型，输入密码后执行
