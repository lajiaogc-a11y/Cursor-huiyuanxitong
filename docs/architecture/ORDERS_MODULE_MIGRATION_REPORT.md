# Orders 模块 Supabase → API 迁移报告

> 完成时间：2025-03  
> 阶段：第六阶段 - Orders 模块迁移

---

## 一、迁移范围说明

Orders 模块涉及：

- **orders** 表：订单主表
- **order_items** 表：订单明细（当前通过 RPC 关联返回）
- **tenantService RPC**：`platform_get_tenant_orders_full`、`platform_get_tenant_usdt_orders_full`、`get_my_tenant_orders_full`、`get_my_tenant_usdt_orders_full`

---

## 二、已迁移文件列表

| 文件 | 变更 |
|------|------|
| `src/services/orders/ordersApiService.ts` | **新增**，封装 getOrdersFullApi、getUsdtOrdersFullApi、createOrderApi、updateOrderPointsApi |
| `src/services/tenantService.ts` | getTenantOrdersFull、getTenantUsdtOrdersFull、getMyTenantOrdersFull、getMyTenantUsdtOrdersFull → ordersApiService |
| `src/services/export/orderImportService.ts` | supabase.from('orders').insert → createOrderApi，积分更新 → updateOrderPointsApi |
| `src/services/orders/orderSideEffectOrchestrator.ts` | supabase.from('orders').update({ points_status }) → updateOrderPointsApi |
| `src/services/points/pointsService.ts` | supabase.from('orders').update({ order_points }) → updateOrderPointsApi（2 处） |
| `src/api/client.ts` | 新增 apiPatch |
| `src/api/index.ts` | 导出 apiPatch |
| `server/src/middlewares/auth.ts` | req.user 增加 token，供 RPC 调用 |
| `server/src/modules/orders/repository.ts` | 新增 getOrdersFullRepository、getUsdtOrdersFullRepository、createOrderRepository、updateOrderPointsRepository |
| `server/src/modules/orders/service.ts` | 新增对应 service 方法 |
| `server/src/modules/orders/controller.ts` | 新增 getOrdersFullController、getUsdtOrdersFullController、createOrderController、updateOrderPointsController |
| `server/src/modules/orders/routes.ts` | 新增 /full、/usdt-full、POST /、PATCH /:id/points |

---

## 三、替换调用数量

| 类型 | 替换前 | 替换后 |
|------|--------|--------|
| supabase.from('orders') | 6 | 4 |
| tenantService RPC (orders 相关) | 4 | 0 |
| **合计** | **10** | **4** |

**说明**：剩余 4 处 `supabase.from('orders')` 位于 useReportData、AdminOverview、DataManagementTab，见第四节。

---

## 四、新 API 列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/orders | 订单列表（tenant_id、分页） |
| GET | /api/orders/full | 非 USDT 订单完整列表（含 order_items，RPC 代理） |
| GET | /api/orders/usdt-full | USDT 订单完整列表（RPC 代理） |
| POST | /api/orders | 创建订单 |
| PATCH | /api/orders/:id/points | 更新订单积分状态（points_status、order_points） |

**RPC 代理说明**：`/full`、`/usdt-full` 在后端通过 `createUserClient(token)` 创建带用户 token 的 Supabase 客户端，调用 `platform_get_tenant_orders_full`、`get_my_tenant_orders_full` 等 RPC，保留原有 RLS 权限逻辑。

---

## 五、剩余 Supabase 调用（orders 相关）

| 文件 | 调用 | 说明 |
|------|------|------|
| useReportData.ts | supabase.from('orders').select('*') | 报表查询（日期、creator 过滤），待迁移 |
| AdminOverview.tsx | supabase.from('orders').select(..., count) | 今日订单 count，待迁移 |
| DataManagementTab.tsx | supabase.from('orders').select/update/delete | 订单批量归档/删除，计划阶段 7 数据管理模块迁移 |

**建议**：useReportData、AdminOverview 可新增 `GET /api/orders/report`、`GET /api/orders/today-count` 或复用 `/full` 加过滤；DataManagementTab 随阶段 7 `/api/data/archive` 一并迁移。

---

## 六、修改的 Hooks / 数据流

| 数据流 | 变更 |
|--------|------|
| orderQueries.ts | 通过 tenantService.getTenantOrdersFull / getMyTenantOrdersFull 获取数据，tenantService 已改为 ordersApiService |
| useOrders / useOrderList / useOrderDetail | 依赖 orderQueries → tenantService → ordersApiService，无需直接修改 |
| orderImportService | 直接调用 createOrderApi、updateOrderPointsApi |
| orderSideEffectOrchestrator | 直接调用 updateOrderPointsApi |
| pointsService | 直接调用 updateOrderPointsApi |

**说明**：orderQueries 未直接引用 ordersApiService，而是通过 tenantService 间接使用，数据来源已切换为 API。

---

## 七、系统验证结果

| 验证项 | 状态 |
|--------|------|
| 前端构建 | ✅ 通过 |
| 后端构建 | ✅ 通过 |
| 订单列表加载（tenantService → ordersApiService） | 待运行时验证 |
| 订单创建（orderImportService） | 待运行时验证 |
| 订单导入 | 待运行时验证 |
| 订单积分更新（pointsService、orderSideEffectOrchestrator） | 待运行时验证 |

**验证步骤**：
1. 启动后端：`cd server && npm run dev`
2. 启动前端：`npm run dev`
3. 登录后测试：订单管理列表、订单创建、订单导入、积分发放后 points_status 更新

---

## 八、依赖说明

- **Auth**：API 依赖 JWT，auth 中间件将 `token` 写入 `req.user`，供 RPC 代理使用
- **tenant_id**：平台管理员可通过 `?tenant_id=` 指定租户；租户员工使用 `getMyTenant*`，后端从 token 解析 tenant_id
- **orderImportService**：导入时先 `createOrderApi` 创建订单，再调用 `createPointsOnOrderCreate`、`batchUpdateMemberActivity`、`logOrderBalanceChange` 等（这些仍用 Supabase，属 points/finance 模块）
