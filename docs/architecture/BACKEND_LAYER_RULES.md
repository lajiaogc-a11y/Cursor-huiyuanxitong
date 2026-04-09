# 后端分层规则 (Backend Layer Rules)

## 标准模块结构

```
server/src/modules/{domain}/
├── routes.ts       路由注册
├── controller.ts   控制器
├── service.ts      业务服务
├── repository.ts   数据访问
├── types.ts        类型定义
└── validator.ts    参数校验
```

## 各层职责

### `routes.ts` — 路由注册

**职责**: 注册 Express 路由，绑定中间件和 controller handler  
**允许调用**: controller 函数、中间件  
**禁止**: 直接 import database、执行 SQL、包含业务逻辑  
**门禁**: `architecture-gate.mjs` Rule 3

```typescript
// ✅ 正确
router.get('/orders', auth, orderController.list);

// ❌ 错误
router.get('/orders', auth, async (req, res) => {
  const rows = await query('SELECT * FROM orders');
  res.json(rows);
});
```

### `controller.ts` — 控制器

**职责**: 接收请求参数、调用 service、格式化响应  
**允许调用**: 同域 service、validator  
**禁止**: 直接 import database、执行 SQL、包含复杂业务逻辑  
**门禁**: `architecture-gate.mjs` Rule 4

```typescript
// ✅ 正确
export async function listOrders(req, res) {
  const filters = validateListParams(req.query);
  const result = await orderService.listOrders(filters, req.user.tenantId);
  res.json({ data: result });
}

// ❌ 错误
export async function listOrders(req, res) {
  const { query: dbQuery } = await import('../../database/index.js');
  const rows = await dbQuery('SELECT * FROM orders WHERE tenant_id = ?', [req.user.tenantId]);
  res.json({ data: rows });
}
```

### `service.ts` — 业务服务

**职责**: 业务流程编排、事务协调、跨域聚合  
**允许调用**: 同域 repository、其他域 service  
**禁止**: 直接操作 `req` / `res`、直接 import database（应走 repository）  
**目标**: 所有 SQL 通过 repository 间接执行

```typescript
// ✅ 正确
export async function createOrder(data: CreateOrderDto, tenantId: string) {
  const member = await memberRepository.findByPhone(data.phone, tenantId);
  const order = await orderRepository.insert({ ...data, memberId: member.id });
  await pointsService.awardOrderPoints(order.id, member.id);
  return order;
}
```

### `repository.ts` — 数据访问

**职责**: SQL 查询、CRUD 操作、数据映射  
**允许**: 直接 `import { query, execute, getConnection } from '../../database'`  
**禁止**: 业务逻辑判断、HTTP 相关操作、跨域数据访问  

```typescript
// ✅ 正确
export async function findByPhone(phone: string, tenantId: string) {
  const rows = await query('SELECT * FROM members WHERE phone = ? AND tenant_id = ?', [phone, tenantId]);
  return rows[0] ?? null;
}
```

## 历史兼容 — `data` 模块

`server/src/modules/data/` 是通用表代理层，包含大量 controller + handler 直接执行 SQL 的历史代码。这些已被白名单豁免：

- `data/routes.ts` — Rule 3 白名单
- `data/*Controller.ts` — Rule 4 白名单
- `data/*Handler.ts` — 作为数据访问层存在

新模块 **禁止** 模仿 data 模块的模式。

## 当前合规状态

| 模块 | routes | controller | service | repository | 整体评级 |
|------|--------|-----------|---------|-----------|---------|
| auth | ✅ | ✅ | ✅ | ✅ | 符合 |
| employees | ✅ | ✅ | ✅ | ✅ | 符合 |
| giftcards | ✅ | ✅ | ✅ | ✅ | 符合 |
| orders | ✅ | ✅ | ⚠️ DB in service | ✅ | 部分符合 |
| members | ✅ | ✅ | ✅ | ✅ | 符合 |
| finance | ✅ | ✅ | ❌ ledgerService 全 SQL | 无 | 不符合 |
| lottery | ✅ | ⚠️ spinFakeFeed | ⚠️ DB in service | ✅ | 部分符合 |
| points | ✅ | ⚠️ pointOrder | ⚠️ writeService | ✅ | 部分符合 |
| data | ⚠️ | ⚠️ 多处 DB | — | ✅ | 历史兼容 |
| memberPortalSettings | ✅ | ✅ | ⚠️ 大量 SQL | ✅ | 部分符合 |
| risk | ✅ | ✅ | ❌ DDL+SQL | 无 | 不符合 |
| taskPosters | ✅ | ✅ | ❌ DDL+SQL | 无 | 不符合 |

## 门禁失败修复指南

### arch-gate: "routes.ts 直接导入数据库模块"
```
1. 创建 controller 函数处理路由 handler
2. controller 调用 service
3. service 调用 repository 执行 SQL
4. routes 只注册 controller handler
```

### arch-gate: "controller 直接导入数据库模块"
```
1. 将 SQL 逻辑迁移到 repository.ts
2. 将业务逻辑迁移到 service.ts
3. controller 只调用 service
```
