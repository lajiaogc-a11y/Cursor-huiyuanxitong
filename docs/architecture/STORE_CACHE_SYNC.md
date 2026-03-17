# Store 缓存与数据同步规范

## 概述

当数据库表发生变更时，相关 Store 的模块级缓存需要被重置，以保证 UI 展示与后端数据一致。

## 统一刷新入口

所有表变更的缓存失效由 `dataRefreshManager.clearStoreCachesByTable()` 统一触发，该函数在 `notifyDataMutation()` 中被调用。

## 表 → Store 映射

| 表名 | 重置函数 |
|------|----------|
| points_ledger | resetPointsLedgerCache |
| points_accounts | resetPointsAccountCache |
| members | resetReferralCache |
| employees | refreshEmployees (nameResolver) |
| payment_providers, vendors, cards | resetMerchantConfigCache |
| ledger_transactions | resetSettlementCache |
| shared_data_store | clearCache (sharedDataService) + resetMerchantConfigCache + resetExchangeRateCache + resetPointsSettingsCache + resetActivitySettingsCache |

## 新增 Store 缓存规范

若 Store 使用 `shared_data_store` 或其它表作为数据源，且存在模块级缓存：

1. 导出 `resetXxxCache(): void` 函数，将缓存置为 `null` 或初始状态
2. 在 `dataRefreshManager.clearStoreCachesByTable()` 中，为对应表添加对该 reset 的调用

## 数据流

```
Realtime postgres_changes
  → dataRefreshManager.notifyDataMutation()
    → queueQueryInvalidations (react-query)
    → emitLegacyEvents (window events)
    → emitDataRefresh (data-refresh event)
    → clearStoreCachesByTable (Zustand/模块缓存)
```
