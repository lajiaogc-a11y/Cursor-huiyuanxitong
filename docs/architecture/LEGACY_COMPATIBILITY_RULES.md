# 历史兼容层规则 (Legacy Compatibility Rules)

## 概述

本项目存在以下历史兼容层 API，它们在架构升级过渡期内被允许存在，但 **严格禁止在新代码中使用**。

## 历史兼容 API 清单

### 1. `dataTableApi` — 通用表代理

- **定义位置**: `src/api/data.ts`
- **当前使用**: 50 个文件
- **迁移目标**: 按业务域拆分为领域 API (`authApi`, `memberApi`, `orderApi` 等)
- **门禁**: `architecture-gate.mjs` Rule 8 白名单

### 2. `dataRpcApi` — 通用 RPC 代理

- **定义位置**: `src/api/data.ts`
- **当前使用**: 50 个文件（与 dataTableApi 高度重叠）
- **迁移目标**: 按业务域拆分为领域 API
- **门禁**: `architecture-gate.mjs` Rule 8 白名单

### 3. `fetchTableSelectRaw` — 原始表代理

- **定义位置**: `src/api/tableProxyRaw.ts`
- **当前使用**: 5 个文件
- **迁移目标**: 合入领域 API
- **门禁**: `architecture-gate.mjs` Rule 8 白名单

### 4. `dataOpsApi` — 操作类代理

- **定义位置**: `src/api/data.ts`
- **当前使用**: 3 个文件
- **迁移目标**: 合入领域 API
- **门禁**: `architecture-gate.mjs` Rule 8 白名单

## 白名单文件清单

以下文件被 `architecture-gate.mjs` 白名单豁免（截至本次审计）：

```
src/api/data.ts                                          (定义层)
src/api/tableProxyRaw.ts                                 (定义层)
src/lib/tableProxyCount.ts                               (基础设施)
src/services/activity/activityRewardTierSyncService.ts   (activity 域)
src/services/admin/adminApiService.ts                    (admin 域)
src/services/announcementService.ts                      (公告域)
src/services/apiKeys/apiKeyService.ts                    (API key 域)
src/services/audit/auditLogService.ts                    (审计域)
src/services/audit/operationLogRestoreService.ts         (审计域)
src/services/auth/authApiService.ts                      (认证域)
src/services/customerSources/customerSourceService.ts    (客户来源域)
src/services/data/dataApiService.ts                      (数据域)
src/services/data/tableQueryService.ts                   (数据域 — barrel re-export)
src/services/data/activityQueryService.ts                (活动域查询)
src/services/data/staffQueryService.ts                   (员工域查询)
src/services/data/crmQueryService.ts                     (CRM 域查询)
src/services/data/memberActivityQueryService.ts          (会员活动域查询)
src/services/data/auditQueryService.ts                   (审计域查询)
src/services/data/financeQueryService.ts                 (财务域查询)
src/services/dataArchiveService.ts                       (数据归档域)
src/services/dataBackupService.ts                        (备份域)
src/services/dataMigrationService.ts                     (迁移域)
src/services/employees/employeeSignupReadiness.ts        (员工域)
src/services/export/importService.ts                     (导入域)
src/services/featureFlagService.ts                       (特性开关域)
src/services/finance/balanceLogReconcileService.ts       (财务域)
src/services/finance/balanceLogRepairService.ts          (财务域)
src/services/finance/balanceLogService.ts                (财务域)
src/services/finance/cardTypesService.ts                 (财务域)
src/services/finance/sharedDataService.ts                (财务域)
src/services/finance/shiftHandoverService.ts             (财务域)
src/services/globalSearchService.ts                      (搜索域)
src/services/invitationCodeService.ts                    (邀请码域)
src/services/login2faService.ts                          (2FA 域)
src/services/maintenanceModeService.ts                   (运维域)
src/services/memberPortal/memberActivityService.ts       (会员门户域)
src/services/memberPortal/memberPortalDiagnosticsRpcService.ts (诊断域)
src/services/members/memberAdminRpcService.ts            (会员管理域)
src/services/members/memberPointsMallRpcService.ts       (积分商城域)
src/services/members/memberPointsMallTableReadService.ts (积分商城域)
src/services/members/memberPointsRedeemRpcService.ts     (积分兑换域)
src/services/members/nameResolver.ts                     (会员域)
src/services/notifications/notificationService.ts        (通知域)
src/services/observability/apiUsageStatsService.ts       (可观测域)
src/services/observability/errorReportService.ts         (可观测域)
src/services/observability/systemHealthService.ts        (可观测域)
src/services/orders/orderAnomalyDetection.ts             (订单域)
src/services/orders/orderRepository.ts                   (订单域)
src/services/points/memberPointsRpcService.ts            (积分域)
src/services/points/pointOrderService.ts                 (积分域)
src/services/points/pointsAccountService.ts              (积分域)
src/services/points/pointsCalculationService.ts          (积分域)
src/services/resourceMonitorService.ts                   (资源监控域)
src/services/staff/activityGiftTableService.ts           (活动域)
src/services/staff/currencyMutationsService.ts           (货币域)
src/services/staff/invitationCodeTableService.ts         (邀请码域)
src/services/staff/pointsTableService.ts                 (积分域)
src/services/staff/rolePermissionsTableService.ts        (权限域)
src/services/userDataSyncService.ts                      (数据同步域)
src/services/webhooks/webhookAdminRpcService.ts          (Webhook 域)
src/services/webhooks/webhookTableService.ts             (Webhook 域)
```

## 迁移优先级

| 优先级 | 业务域 | 文件数 | 迁移难度 | 说明 |
|--------|--------|--------|---------|------|
| P0 | orders | 2 | 中 | 核心交易链路，应首先样板重构 |
| P0 | auth | 1 | 中 | 认证核心 |
| P1 | finance | 6 | 高 | 涉及结算/账本/余额，需谨慎 |
| P1 | members | 5 | 高 | 会员体系核心 |
| P1 | points | 4 | 中 | 积分系统 |
| P2 | audit | 2 | 低 | 审计日志 |
| P2 | staff | 5 | 低 | 员工管理功能 |
| P3 | observability | 3 | 低 | 监控类 |
| P3 | webhooks | 2 | 低 | 辅助功能 |
| P3 | 其他 | ~20 | 低 | 非核心功能 |

## 规则

1. **新功能禁止使用** `dataTableApi` / `dataRpcApi` / `fetchTableSelectRaw`
2. **白名单只减不增** — 迁移完成后从白名单移除，不允许新增白名单条目
3. **修改白名单文件时必须检查** — 是否可以顺便迁移掉 legacy 调用
4. **门禁自动检查** — `npm run arch:gate` / CI `arch-gate` job
