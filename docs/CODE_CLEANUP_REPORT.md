# 无用代码清理报告

## 第一阶段：扫描方法说明

### 工具

- 使用 `npx knip` 对仓库做静态扫描。**Knip 的「未使用文件」在 Vite 多入口、动态 `import()`、脚本与 `会员前端设计/` 参考子项目并存时假阳性极多**，不可单独作为删除依据。
- 对候选文件用 **import 路径全文检索**（`@/lib/...`、`from '...'`）交叉验证。

### 禁止删除（约束）

| 类别 | 说明 |
|------|------|
| 路由 | `App.tsx`、`lazyPages`、`memberStaffRouteConfig`、动态 chunk |
| 权限 | `dataFieldPermissionModules`、`useFieldPermissions`、服务端同步键 |
| 日志 / 审计 | `auditLogService`、`useOperationLogs`、操作日志相关 |
| 核心 hooks | `AuthContext`、`MemberAuthContext`、`useMembers`、`useQuery` 封装等 |
| 动态 import | `MemberLayout` 预加载、`lazy()` 页面、`import('@/services/...')` 链 |

### 风险分级

| 等级 | 含义 |
|------|------|
| **高** | 与认证/初始化/业务契约相关，或 Knip 报未引用但可能动态使用；**仅标注 TODO，不删** |
| **低** | 全仓库无 import、无 re-export、无字符串路径引用；删除后 **tsc/build 通过** |

### 清单（节选，不自动删除）

**高风险候选（Knip / 扫描提示，需人工确认）**

- `server/**`、根目录 `scripts/**`：运维/迁移入口，非应用运行时依赖图。
- `会员前端设计/premium-ui-boost-main/**`：设计参考副本，与主应用构建无关。
- `src/services/authPasswordSyncService.ts`：`syncAuthPassword` 当前无引用，属认证扩展能力。
- `src/services/appInitializer.ts`：`initializeApp` 无外部引用，可能为预留冷启动链。

**低风险（本报告第四阶段已删除）**

- `src/lib/memberLedgerToday.ts` — `sumTodayEarnedFromLedger` 无引用。
- `src/lib/memberHomeHeroBackground.ts` — `MEMBER_HOME_HERO_BACKGROUND` 无引用。
- `src/lib/memberTheme.ts` — `MEMBER_THEME` 无引用。
- `src/lib/permissionRegistry.ts` — 对 `dataFieldPermissionModules` 的重复 re-export，全仓库无 `import`。
- `src/lib/translations.ts` — 已 `@deprecated` 的空占位，应使用 `@/locales/translations`。

---

## 第二阶段：标记

对高风险未引用文件在文件首行增加：

`// TODO: unused-candidate — verify callers / product intent before removal`

不删除代码。

---

## 第三阶段：验证

| 命令 | 结果 |
|------|------|
| `npx tsc --noEmit` | 通过 |
| `npm run build` | 通过 |
| `npm run lint` | **未通过**（仓库内既有问题：`MemberDashboard.tsx` 条件 Hook 2 条 error；其余为 warning）。与本次删除的 5 个 lib 文件无关。 |

---

## 第四阶段：删除记录

| 文件 | 原因 |
|------|------|
| `src/lib/memberLedgerToday.ts` | 无引用，逻辑已由 RPC「今日获得」等替代或未接入 |
| `src/lib/memberHomeHeroBackground.ts` | 常量未使用 |
| `src/lib/memberTheme.ts` | 常量未使用 |
| `src/lib/permissionRegistry.ts` | 重复导出，业务已直引 `dataFieldPermissionModules` |
| `src/lib/translations.ts` | deprecated 空对象，无 `@/lib/translations` 引用 |

**未删除**：`authPasswordSyncService.ts`、`appInitializer.ts`（已 TODO 标注）。
