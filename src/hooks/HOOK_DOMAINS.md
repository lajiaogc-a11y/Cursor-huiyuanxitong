# Hooks 业务域子目录规划

> 目标：将 `src/hooks/` 下按业务域归类到子目录。已完成的域以 ✅ 标记。

## 域划分

| 子目录 | 文件清单 | 状态 |
|--------|---------|------|
| `orders/` | useOrderList, useOrderMutations, useUsdtOrderList, useUsdtOrderMutations, orderQueries, useOrderRealtime, useOrderStats, types, utils, index | ✅ 已完成 |
| `members/` | useMembers, useMemberActivity, useMemberPoints, useMemberPointsBreakdown, useMemberLogin, useMemberPortalSettings, useMemberSkeletonGate, useMemberPullRefreshSignal, useMemberSpinQuota, useMemberDashboardDailyTasks, useMemberMallProductImage, useMemberLocalAvatar, useMemberEntryFormPersistence, useMemberResolvableMedia, useMemberAnimatedCount | ✅ 已完成 |
| `activity/` | useActivityTypes, useActivityGifts, useActivityDataContent, useGiftDistributionSettings | ✅ 已完成 |
| `audit/` | useAuditWorkflow, useAuditRecords, usePendingAuditCount, useOperationLogs, useOperationLogsTable, usePermissionChangeLogs | ✅ 已完成 |
| `staff/` | useFieldPermissions, usePermissionVersions, useEmployees, useLoginLogs, useNavigationVisibility, useKnowledge, useShiftHandoverFormPersistence | ✅ 已完成 |
| `finance/` | useCurrencies, usePointsLedger, usePointsSettingsData, useCalculatorStore, useMerchantConfig | ✅ 已完成 |
| `system/` | useMaintenanceMode, useTenantFeatureFlag, useSessionExpiration, useGlobalHotkeys, useKeyboardShortcuts, useApiKeys, useWebhooks, useGlobalErrorReporter, useNotifications | ✅ 已完成 |
| `tasks/` | useTaskPosters, useOpenTasks, useTaskHistory | ✅ 已完成 |
| `crm/` | useCustomerSources, useReferrals, useReferralFormPersistence | ✅ 已完成 |
| `ui/` | use-mobile, use-toast, useColumnVisibility, useDebounce, useExportConfirm | ✅ 已完成 |
| `auth/` | useAuthGuard, useIsPlatformAdminViewingTenant | ✅ 已完成 |
| `dashboard/` | useDashboardTrend, useReportData | ✅ 已完成 |
| _(root)_ | useNameResolver | 跨域工具类，保留根目录 |

## 当前状态

- **12 个业务域** 已全部迁移完成
- 根目录仅保留 1 个跨域工具 hook（`useNameResolver`）
- 架构门禁 R13 已新增，防止 legacy proxy 回归
