# SPA 路由、React Query 与安全 / E2E 审计报告

> 生成说明：基于代码库扫描与本轮修复整理。全量「验收十条」需分阶段迭代；本文档给出**问题总览、清单与优先级**。

---

## 1. 问题总览

| 类别 | 状态 |
|------|------|
| 站内整页刷新 | **已修一批**：401 跳转、IP 校验登出、会员登录成功、订单跳转、布局切换等改为 SPA 导航或去 reload |
| React Query 默认策略 | **已对齐**：`staleTime=5min`，`refetchOnMount/windowFocus=false`，`retry` 查询 2 / 变更 1 |
| 登录预取 | **已有**：`AuthContext.syncUserData` 内并行 `prefetchQuery`（employees、cards、vendors、payment-providers、activity-types、members） |
| 写后刷新 | **部分**：多处已 `invalidateQueries`；仍有页面用 `useState+useEffect` 自拉数据，需逐页改为 Query + invalidate |
| E2E | **待建**：仓库有 `playwright` 依赖但无 `playwright.config`；已加 `spaNavigation` 单元测试作为基础防护 |

---

## 2. 会导致整页刷新 / 全量重载的位置（历史与保留）

| 位置 | 行为 | 处理 |
|------|------|------|
| `DomainAwareRoutes.tsx` | `window.location.replace` 到 **员工子域名** | **保留**：跨子域必须整页 |
| `main.tsx` / `lazyWithRetry` / `ErrorBoundary` / `PullToRefresh` | `reload` | **保留**：Chunk 恢复、错误恢复、用户主动下拉刷新 |
| `UpdatePrompt.tsx` | `replace` 去版本参数 | **保留**：强制拿新静态资源 |
| `api/init.ts`（401） | 原 `location.href` | **已改** `spaNavigate` |
| `AuthContext` IP 失败登出 | 原 `location.href` | **已改** `spaNavigate` |
| `MemberLogin` 成功 | 原 `replace` | **已改** `navigate` |
| `PointsTransactionsTab` / `MemberActivityData` | 原错误路径 `/order-management` + `location` | **已改** `navigate('/staff/orders')` |
| `LayoutContext.toggleForceDesktopLayout` | `reload` | **已移除**：纯状态切换 |

---

## 3. 建议改为 React Query / 统一缓存的模块（高价值）

- `hooks/useMemberSpinQuota.ts`：当前 `useEffect` + 手写 state → `useQuery(['lottery-quota', memberId], …)` + 签到/抽奖后 `invalidateQueries`
- `hooks/useMemberPortalSettings.ts`：可逐步改为 `useQuery` + `placeholderData` 读 localStorage
- `hooks/usePointsLedger` 等：核对是否与列表页重复请求，合并 `queryKey`
- 大列表页（订单、会员、报表）：分页/筛选建议 `queryKey` 包含 `page、filter`，避免整表重复拉取

---

## 4. 建议增加预取的数据（在 `syncUserData` 或登录成功后）

- Dashboard：`dashboard-trend`（需固定默认日期区间与 `tenantId`，与 `useDashboardTrend` 的 key 一致）
- 权限：`getRolePermissions` 可改为 `useQuery` + 登录后 `prefetchQuery`
- 通知 / 最近活动：若存在 REST 封装，统一 `prefetchQuery`，**失败不阻塞登录**（已有模式）

---

## 5. 写操作后应 `invalidateQueries` 的典型场景

- 订单创建/更新/删除 → `['orders']` 或与页面一致的 key
- 会员编辑 → `['members']`
- 积分流水变更 → 积分相关列表 key
- 会员活动页「重新计算」类操作 → 已有 `member-activity-page-data` 示例，其它摘要接口应对齐

---

## 6. 重复 fetch / 临时规避

- 搜索 `hasLoadedRef`、`loadedOnce`、`useEffect(() => { fetch` 逐项评估，改为单一 `queryKey` 或 `enabled` 控制
- 删除散落 `refetch()` 按钮逻辑时，优先 `invalidateQueries` 保持缓存一致性

---

## 7. 权限与安全（回归要点）

- **401**：仍清 token；导航改 SPA 不改变安全边界
- **子域隔离**：`EmployeeRouteRedirect` 跨域跳转保留
- **Token**：员工 JWT / 会员 JWT 分 key（`apiClient`）；**登出**：员工 `queryClient.clear()`；会员 `removeQueries({ queryKey: ['member'] })`（仅会员端 Query 前缀）
- **XSS/CSRF**：接口仍以 JWT + 后端校验为准；前端避免 `dangerouslySetInnerHTML` 未消毒内容
- **权限绕过**：缓存层不得跳过 `ProtectedRoute` / `AdminProtectedRoute`；Query 仅减少重复请求，不替代鉴权

---

## 8. 建议补上的 E2E（Playwright）

1. 员工登录 → 侧边栏切换 2～3 个菜单：**无完整文档导航**（Network 无 `document` 类型主请求，或 `performance.getEntriesByType('navigation')` 为 SPA）
2. 登录后 DevTools：预取请求出现（employees / members 等）
3. 会员登录 → 仪表盘：无整页 reload
4. 401 模拟：跳转登录页且状态清空
5. 未授权路径：被重定向或 403 提示
6. 慢网：`retry` 与 loading / 错误提示

**环境**：配置 `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173`，先 `npm run dev` 再 `npx playwright test`（需补充 `@playwright/test` 与 `playwright.config.ts`）。

---

## 9. 本轮修改文件清单

- `src/lib/spaNavigation.ts`（新）
- `src/components/SpaNavigationBridge.tsx`（新）
- `src/lib/spaNavigation.test.ts`（新）
- `src/App.tsx` — 挂载 `SpaNavigationBridge`
- `src/api/init.ts` — 401 使用 `spaNavigate`
- `src/contexts/AuthContext.tsx` — IP 登出 + `queryClient.clear()` on signOut
- `src/contexts/LayoutContext.tsx` — 去掉布局切换 `reload`
- `src/contexts/MemberAuthContext.tsx` — 登出清理 `['member']` 前缀 Query
- `src/lib/queryClient.ts` — 默认 `retry`
- `src/pages/member/MemberLogin.tsx` — 登录成功 `navigate`
- `src/components/PointsTransactionsTab.tsx` — 跳转订单 `navigate('/staff/orders')`
- `src/pages/MemberActivityData.tsx` — 同上路径修正

---

## 10. 修复优先级排序（后续迭代）

1. **P0**：站内导航统一（继续扫 `location` / 错误路由路径）✅ 部分完成  
2. **P0**：401 / 登出与 Query 清理 ✅  
3. **P1**：`useMemberSpinQuota` → Query + invalidate  
4. **P1**：大列表与写操作统一 invalidate 范围  
5. **P2**：Dashboard / 权限 prefetch  
6. **P2**：Playwright 流水线 + 慢网用例  

---

## 11. 修复后验证清单（手工）

- [ ] Chrome DevTools → Network：**Filter Doc**，在员工后台切换页面应**无新的 HTML 文档请求**（首屏与强制刷新除外）
- [ ] 切换页面：无闪白全屏、布局状态保持（侧栏滚动已由 `LayoutContext` 保存）
- [ ] 登录后第二次进入同一数据页：**无明显 loading**（5 分钟内 stale）
- [ ] 修改数据后：列表与详情与后端一致（invalidate 生效）
- [ ] 退出登录：再进受保护路由需重新登录；敏感列表不应短暂显示旧数据

---

## 12. 加载体验（NProgress / 细条）

- 懒加载路由：`Suspense` + `TopProgressBar`（NProgress）已存在  
- 主布局：`RouteProgressBar` 在路由 `pathname` 变化时显示顶部细条  
- 目标：避免**页面中心全屏 loading**；具体页面可把 `isLoading` 改为骨架或局部占位
