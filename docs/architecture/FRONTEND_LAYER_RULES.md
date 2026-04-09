# 前端分层规则 (Frontend Layer Rules)

## 各层职责与禁止事项

### `src/pages/` — 页面装配层

**职责**: 路由入口、布局、组件装配  
**允许导入**: `@/components/*`, `@/hooks/*`, `@/services/*`, `@/contexts/*`, `@/lib/*`(非 apiClient), `@/types/*`  
**禁止导入**: `@/api/*`, `@/lib/apiClient`, `fetch()`, `axios`  
**门禁**: ESLint `no-restricted-imports` + `architecture-gate.mjs` Rule 5

### `src/components/` — UI 组件层

**职责**: 展示组件、局部交互，不直接发业务请求  
**允许导入**: `@/components/*`, `@/hooks/*`, `@/services/*`, `@/contexts/*`, `@/lib/*`(非 apiClient), `@/types/*`  
**禁止导入**: `@/api/*`, `@/lib/apiClient`  
**门禁**: ESLint `no-restricted-imports` + `architecture-gate.mjs` Rule 6  

> **注意**: 当前 91 个组件直接 import `@/services/*`。这是允许的但不推荐 — 优先通过 hooks 间接调用。

### `src/hooks/` — 状态复用层

**职责**: UI 状态管理、数据获取封装（React Query）、页面交互逻辑  
**允许导入**: `@/services/*`, `@/lib/*`, `@/types/*`, `@/contexts/*`  
**禁止导入**: `@/pages/*`, `@/api/*`（新代码禁止，历史白名单 12 个文件除外）  
**门禁**: ESLint `no-restricted-imports` (warn) + `architecture-gate.mjs` Rule 9

> **注意**: hooks 中的纯数据获取函数应提取到 services 层（参考 auth 样板重构中 `fetchCardsFromDb` → `merchantDataService.ts` 的迁移）。

### `src/services/` — 业务编排层

**职责**: 用例逻辑、流程控制、数据转换、错误处理  
**允许导入**: `@/api/*`, `@/lib/*`(非 notifyHub), `@/types/*`, 其他 `@/services/*`  
**禁止导入**: `@/pages/*`, `@/components/*`, `@/lib/notifyHub`(新代码), `document.createElement`(新代码)  
**门禁**: ESLint `no-restricted-imports` + `architecture-gate.mjs` Rule 7 + Rule 12

### `src/api/` — 请求适配层

**职责**: HTTP 接口定义、DTO 转换、统一错误包装  
**允许导入**: `@/lib/apiClient`, `@/types/*`  
**禁止**: 包含业务逻辑（条件分支、循环处理、状态管理）

### `src/lib/` — 基础设施层

**职责**: apiClient、工具函数、通知中心  
**注意**: `apiClient` 只应被 `api/` 层和 `services/staff/dataApi/*` 直接使用

### `src/types/` — 共享类型

**职责**: 跨层共享的 TypeScript 类型和接口  
**规则**: 纯类型文件，不含运行时逻辑

## 新功能开发示例

```
需求：新增"优惠券"功能

1. src/api/coupons.ts           — 定义 API 调用
2. src/services/coupons/        — 业务逻辑
3. src/hooks/useCoupons.ts      — React Query 封装
4. src/components/CouponCard.tsx — UI 组件
5. src/pages/CouponsPage.tsx    — 页面装配
```

## 门禁失败修复指南

### ESLint: "pages 层禁止直接 import api 层"
```
把 API 调用移到 service 或 hook 中，页面只调用 service/hook。
```

### ESLint: "services 层禁止反向依赖 components 层"
```
把组件中导出的业务函数迁移到独立的 service 文件。
参考: appInitializer.ts → copySettingsService.ts 的迁移案例。
```

### arch-gate: "非白名单文件使用 legacy proxy"
```
新文件不能使用 dataTableApi/dataRpcApi。
创建对应的领域 API (src/api/xxx.ts) 并通过 service 调用。
```

### arch-gate R9: "hooks/ 直接 import @/api/*"
```
新 hook 不应直接导入 api 层。
创建或复用 service 层函数，hook 只调用 service。
参考: useNavigationVisibility → staffPermissionsService 的迁移。
```

### arch-gate R12: "services/ 使用 UI API"
```
新 service 不应使用 notify/DOM 操作。
service 应返回 result/error 对象，由调用方(hook/page)决定展示方式。
参考: serviceResult.ts 模式。
```
