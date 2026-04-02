# 架构去重与稳定性审计（执行摘要）

> 目标：减少「改一处坏一片」与重复实现。本文为**清单 + 优先级**，全量收敛需分迭代完成。

---

## 1. 重复逻辑 / 多入口（高优先级）

| 领域 | 现象 | 建议 |
|------|------|------|
| 数据导出 | CSV/XLSX（`services/export`）与 ZIP 迁移（`databaseMigrationService`）与 **mysqldump** 三条路径 | **对外文档只推荐 mysqldump**；ZIP 标 legacy；API 层避免再增第四种 |
| 认证后请求 | `apiClient`、`fetch` 散落、部分 `supabase.from` | 新业务 **只走** `@/lib/apiClient` + 后端 API |
| 权限 | `role` / `is_super_admin` / `is_platform_super_admin` 在多处重复判断 | 抽 **`canMysqlDump` 类** 到 `src/lib/permissions.ts`（服务端同步维护 `middleware`） |
| 订单/积分计算 | 前后端均有计算与校验 | 以 **服务端结果为最终真理**；前端仅展示与乐观 UI |

---

## 2. 副本 / 临时文件（扫描结果摘要）

下列模式在仓库中存在（**不全等于应删**，需个案确认）：

- `**/fix*.sql` / `**/fix*.mjs` / `server/scripts/fix-*.cjs`：**迁移历史** → 归入 `docs/migrations-legacy.md` 并避免继续堆叠同名脚本。
- `supabase/migrations/*fix*.sql`：若已切 MySQL，标记 **只读归档**，新变更走 `mysql/` + 服务端 `migrate*.ts`。
- `server/_patch_*.mjs`：评估是否可删或并入 `mysql/fix_schema.mjs`。

**原则**：新代码禁止 `*patch*` / `*temp*` 进主分支；用带日期的单次迁移脚本 + PR 说明。

---

## 3. 状态分裂风险

| 点 | 风险 | 缓解 |
|----|------|------|
| React Query 与 `useEffect`+`useState` 并存 | 重复请求、缓存不一致 | 读模型逐步 **useQuery**；写后 **invalidateQueries** |
| `AuthContext` 与 `sessionStorage` 员工缓存 | 极少场景不同步 | 已缓存；新状态避免再开第三份 |
| 全局 `window.dispatchEvent` | 隐式耦合 | 改为 Query invalidate 或显式 `eventBus` 模块并文档化 |

---

## 4. 高风险崩溃模式

- **循环依赖**：`AuthContext` ↔ hooks 已用动态 `import()` 打破；新增 Context 时保持此模式。
- **竞态**：快速切页 + 未取消的 `fetch` → `AbortController` 或 Query `enabled`。
- **整库导出**：浏览器 `blob` 大文件 OOM → **文档强制 curl**（已写在 MYSQL-MIGRATION-DUMP-RESTORE.md）。

---

## 5. 统一目录建议（目标态）

```
src/api/           # HTTP 封装，无业务
src/services/      # 业务编排、可单测
src/hooks/         # useQuery/useMutation 组合
src/lib/           # 纯函数、权限、常量
src/components/    # 展示与局部交互
server/src/modules/# 按领域路由 + service + repository
```

---

## 6. 重构执行顺序（建议）

1. **定唯一真相**：MySQL 迁移 = mysqldump；文档与 UI 对齐。  
2. **抽权限工具函数**（前后端对称文档）。  
3. **消灭高危散落 supabase 写路径**（错误上报等）。  
4. **大组件拆分**（OrderManagement、ReportManagement）。  
5. **脚本归档 + knip 死代码**。

---

## 7. 回归验证清单

- [ ] 修改权限规则后，**中间件 + 前端按钮**同时更新  
- [ ] 导出后 `operation_logs` 有记录  
- [ ] 无重复 `queryKey` 描述同一资源  
- [ ] 关键列表：写操作后 **无需整页刷新** 即可见新数据  

---

**结论**：完全满足「任何逻辑只存在一份」需长期治理；本轮已把 **数据库迁移** 收敛到 **mysqldump 单一路径**，并标注 ZIP 导出为 legacy，降低架构分叉。
