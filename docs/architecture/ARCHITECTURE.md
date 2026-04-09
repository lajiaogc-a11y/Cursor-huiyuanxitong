# 项目架构文档

## 目标架构

```
Page(UI) → Service(Business Logic) → API Client(Request Layer) → Backend/API → Database
```

### 前端分层

```
src/
├── pages/          页面入口 — 路由、布局、组件装配
├── components/     UI 组件 — 展示、交互，不含业务请求
├── hooks/          状态复用 — UI 状态、页面交互逻辑
├── services/       业务编排 — 用例逻辑、流程控制
│   ├── auth/       认证域
│   ├── members/    会员域
│   ├── orders/     订单域
│   ├── finance/    财务域
│   ├── points/     积分域
│   ├── copy/       复制设置域
│   └── ...
├── api/            请求适配 — 接口定义、DTO 转换
├── lib/            基础设施 — apiClient、工具函数
├── types/          共享类型
└── contexts/       React Context
```

### 后端分层

```
server/src/modules/{domain}/
├── routes.ts       路由注册 — 只绑定中间件和 handler
├── controller.ts   控制器 — 收参、调 service、回参
├── service.ts      业务服务 — 流程编排、事务协调
├── repository.ts   数据访问 — SQL 查询、CRUD
├── types.ts        类型定义
└── validator.ts    参数校验（Zod schema）
```

## 依赖方向（严格单向）

```
pages → hooks → services → api → lib/apiClient
          ↓
      components
```

**禁止方向**:
- pages ✗→ api
- pages ✗→ lib/apiClient
- components ✗→ api
- components ✗→ lib/apiClient
- services ✗→ pages
- services ✗→ components
- hooks ✗→ pages
- hooks ✗→ api（新代码，历史白名单内除外）
- contexts ✗→ hooks（数据获取函数应放在 services 层）
- 后端 service ✗→ database（应通过 repository，白名单内除外）
- 后端 routes ✗→ service 直调（应通过 controller，白名单内除外）
- 前端 services ✗→ UI API（notify/DOM 操作，白名单内除外）

## 门禁机制

| 机制 | 命令 | 覆盖范围 |
|------|------|---------|
| Architecture Gate | `npm run arch:gate` | 12 条规则（前后端分层） |
| ESLint boundaries | `npm run lint` | pages/components/services/hooks 边界 |
| TypeScript | `npx tsc --noEmit` | 类型安全 |
| CI Pipeline | `.github/workflows/architecture.yml` | 自动阻断 |

### 门禁规则清单

| 规则 | 范围 | 描述 |
|------|------|------|
| R1 | 后端 | server tableProxy 引用收敛 |
| R2 | 后端 | security/accessScope 纯净性 |
| R3 | 后端 | routes.ts 禁止直接 DB 访问 |
| R4 | 后端 | controller*.ts 禁止直接 DB 访问 |
| R5 | 前端 | pages/ 禁止直接 import api/apiClient |
| R6 | 前端 | components/ 禁止直接 import api/apiClient |
| R7 | 前端 | services/ 禁止反向依赖 pages/components |
| R8 | 前端 | 新代码禁止使用 legacy proxy（白名单外） |
| R9 | 前端 | hooks/ 禁止直接 import @/api/*（白名单外） |
| R10 | 后端 | service*.ts 禁止直接 import database（白名单外） |
| R11 | 后端 | routes.ts 禁止跳过 controller 直调 service（白名单外） |
| R12 | 前端 | services/ 禁止使用 UI API（白名单外） |

## 历史兼容层

项目中存在 `dataTableApi` / `dataRpcApi` / `fetchTableSelectRaw` 等通用代理，
已标记为历史兼容层，详见 [LEGACY_COMPATIBILITY_RULES.md](./LEGACY_COMPATIBILITY_RULES.md)。

**新代码必须使用领域 API Client**（如 `src/api/orders.ts`、`src/api/members.ts`），
禁止绕过走通用表代理。

## 新功能开发流程

1. 输出【本次需求架构预览】
2. 确认涉及的 Module / Page / Service / API Client / Backend / Database
3. 如涉及旧代码修改，输出【旧代码迁移清单】
4. 等待确认后再编码
5. 完成后运行 `npm run arch:check` 验证

## 常见违规示例

### 错误：组件直接调用 API

```typescript
// ❌ 组件不应直接导入 api 层
import { apiClient } from '@/lib/apiClient';
import { getMemberApi } from '@/api/members';

// ✅ 组件通过 service/hook 间接调用
import { useMemberData } from '@/hooks/useMembers';
```

### 错误：Service 反向依赖组件

```typescript
// ❌ service 不应导入 components
import { SomeComponent } from '@/components/SomeComponent';

// ✅ components 调用 services，不是反过来
```

### 错误：后端 Controller 直接 SQL

```typescript
// ❌ controller 不应直接操作数据库
const rows = await query('SELECT * FROM orders WHERE ...');

// ✅ controller → service → repository
const orders = await orderService.getOrders(filters);
```

### 错误：Hook 直接调用 API 层

```typescript
// ❌ hook 不应直接导入 api 层
import { getRolePermissions } from '@/api/staffData';

// ✅ hook 通过 service 间接调用
import { getStaffRolePermissions } from '@/services/staff/staffPermissionsService';
```

### 错误：Context 反向依赖 Hook

```typescript
// ❌ Context 不应从 hooks 导入数据获取函数
import { fetchCardsFromDb } from '@/hooks/useMerchantConfig';

// ✅ 将数据获取函数提取到 service 层
import { fetchCardsFromDb } from '@/services/giftcards/merchantDataService';
```

## 样板链路：Auth 认证（完整参考）

```
前端:
  Login.tsx (页面) → AuthContext (上下文)
    → authApiService (services/auth/) → authApi (api/auth.ts) → apiClient (lib/)

  AuthContext 依赖:
    → services/auth/authApiService        ✅ 业务编排
    → services/staff/staffPermissionsService  ✅ 权限数据（经 service 层）
    → services/giftcards/merchantDataService  ✅ 基础数据预取（经 service 层）
    → services/activity/activityTypeDataService  ✅ 活动类型预取（经 service 层）

后端:
  auth/routes.ts → auth/controller.ts → auth/service.ts → auth/repository.ts → MySQL
```
