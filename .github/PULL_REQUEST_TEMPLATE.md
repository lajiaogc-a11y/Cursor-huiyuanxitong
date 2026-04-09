## 变更说明

（简要描述本次 PR 的目的与行为变化）

## 架构自检

### 业务域
- [ ] 本次改动属于哪个业务域：______
- [ ] 是否新增 API 接口
- [ ] 是否修改 Service 层
- [ ] 是否修改 Repository / 数据访问层

### 架构合规
- [ ] 是否触碰历史兼容层 (`dataTableApi` / `dataRpcApi` / `tableProxyRaw`)
- [ ] 是否新增 `direct fetch` / `direct table proxy`（新代码禁止）
- [ ] 是否通过 architecture gate：`npm run arch:gate`
- [ ] 是否通过 TypeScript 检查：`npx tsc --noEmit`
- [ ] 是否通过 ESLint：`npm run lint`

### 分层检查（12 条门禁规则）
- [ ] pages/ 未直接 import `@/api/*` 或 `@/lib/apiClient` (R5)
- [ ] components/ 未直接 import `@/api/*` 或 `@/lib/apiClient` (R6)
- [ ] services/ 未反向依赖 pages/ 或 components/ (R7)
- [ ] hooks/ 未新增直接 import `@/api/*`（历史白名单除外）(R9)
- [ ] 后端 service 未新增直接 import database（历史白名单除外）(R10)
- [ ] 后端 routes 通过 controller 分发（历史白名单除外）(R11)
- [ ] services/ 未新增 notify/DOM 操作（历史白名单除外）(R12)

### 其他
- [ ] 是否补充/更新架构文档
- 关联 issue / 文档：（可选）
