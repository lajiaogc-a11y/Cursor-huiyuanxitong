# Zustand 状态分析 (Stores Analysis)

## 概述

`src/stores` 使用 Zustand 或纯函数 + 内存缓存管理状态，部分与 `shared_data_store` 同步。

---

## 1. exchangeRateStore.ts

- **类型**：函数 + 内存缓存
- **State**：`BaseExchangeRates`, `FinalExchangeRates`, `ExchangeRateSettings`（缓存 `settingsCache`）
- **Actions**：`getExchangeRateSettings`, `saveExchangeRateSettings`, `fetchBaseRates`, `invalidateCache`
- **数据源**：`shared_data_store`（key: `exchangeRateSettings`）

---

## 2. exchangeRateFormStore.ts

- **类型**：表单状态
- **State**：汇率表单字段
- **Actions**：表单读写

---

## 3. orderStore.ts

- **类型**：工具函数 + 类型定义
- **State**：无（订单数据在 DB，通过 hooks 获取）
- **Actions**：`calculateOrderPoints`, `logOperation`（审计）

---

## 4. pointsSettingsStore.ts

- **类型**：函数 + 内存缓存
- **State**：`PointsSettings`（mode, ngnToUsdRate, ghsToUsdRate, usdToPointsRate, referral 等）
- **Actions**：`getPointsSettings`, `savePointsSettings`, `initializePointsSettings`, `resetPointsSettingsCache`
- **数据源**：`shared_data_store`（key: `points_settings`）

---

## 5. pointsAccountStore.ts

- **类型**：积分账户状态
- **State**：会员积分账户
- **Actions**：加载/更新积分账户

---

## 6. pointsLedgerStore.ts

- **类型**：积分明细
- **State**：`points_ledger` 数据
- **Actions**：加载/刷新积分明细

---

## 7. activitySettingsStore.ts

- **类型**：函数 + 内存缓存
- **State**：`ActivitySettings`（accumulatedRewardTiers, referralReward, activity1Enabled, activity2）
- **Actions**：`getActivitySettings`, `saveActivitySettings`, `getRewardAmountByPointsAndCurrency`
- **数据源**：`shared_data_store`（key: `activity_settings`）

---

## 8. rewardTypeStore.ts

- **类型**：奖励类型配置
- **State**：奖励档位
- **Actions**：读写奖励配置

---

## 9. merchantConfigStore.ts

- **类型**：函数 + 内存缓存
- **State**：`CardItem[]`, `Vendor[]`, `PaymentProvider[]`, `cardTypesCache`
- **Actions**：`initializeMerchantConfigCache`, `fetchCardsFromDb`, `fetchVendorsFromDb`, `fetchPaymentProvidersFromDb` 等
- **数据源**：`cards`, `vendors`, `payment_providers`, `card_types`

---

## 10. merchantSettlementStore.ts

- **类型**：商户结算状态
- **State**：结算数据、筛选条件
- **Actions**：加载结算数据、筛选

---

## 11. customerSourceStore.ts

- **类型**：客户来源
- **State**：`customer_sources` 列表
- **Actions**：加载/更新客户来源

---

## 12. employeeStore.ts

- **类型**：员工状态
- **State**：`Employee[]` 列表
- **Actions**：`fetchEmployees`, `fetchPlatformEmployees`, `createEmployee`, `updateEmployee`, `deleteEmployee` 等
- **数据源**：RPC `get_my_tenant_employees_full`, `platform_get_tenant_employees_full`；表 `employees`, `employee_name_history`

---

## 13. auditLogStore.ts

- **类型**：审计日志
- **State**：无（仅写）
- **Actions**：`logOperation`（写入审计日志）

---

## 14. shiftHandoverStore.ts

- **类型**：交班对账
- **State**：交班数据
- **Actions**：加载/保存交班记录

---

## 15. referralStore.ts

- **类型**：推荐关系缓存
- **State**：推荐关系缓存
- **Actions**：`initializeReferralCache`, `resetReferralCache`

---

## 16. productionLockStore.ts

- **类型**：生产锁定
- **State**：锁定状态
- **Actions**：锁定/解锁

---

## 17. systemSettings.ts

- **类型**：系统设置
- **State**：系统级配置
- **Actions**：读写系统设置
