## 变更说明

（简要描述本次 PR 的目的与行为变化）

## 架构与权限自检（方案 E）

- [ ] **是否新增或变更数据入口**（新表、新 RPC、新导出 API、绕过 tableProxy 的直连 SQL 等）
- [ ] **是否影响权限 / 租户边界**（JWT、平台总管理、租户切换、`tableProxy` 白名单、会员/员工路由）
- [ ] **是否已跑本地校验**：`cd server && npm run build`、`npm run build`、`node scripts/architecture-gate.mjs`
- [ ] **增量 ESLint**：`npm run lint:staged` 或通过 CI 的 `lint-incremental`（约定见根目录 `CONTRIBUTING.md`）

## 其他

- 关联 issue / 文档：（可选）
