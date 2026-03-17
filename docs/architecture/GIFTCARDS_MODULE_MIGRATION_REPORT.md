# Giftcards 模块 Supabase → API 迁移报告

> 完成时间：2025-03  
> 阶段：第五阶段 - Giftcards 模块迁移

---

## 一、迁移范围说明

本项目**无** `gift_cards`、`giftcard_transactions` 表。Giftcards 模块对应以下表：

- **cards**：礼品卡类型（NGN/GHS/USDT 等）
- **vendors**：卡商
- **payment_providers**：支付渠道/代付商家

---

## 二、已迁移文件列表

| 文件 | 变更 |
|------|------|
| `src/services/giftcards/giftcardsApiService.ts` | **新增**，封装 cards/vendors/providers 全部 API |
| `src/services/finance/merchantConfigReadService.ts` | 移除 supabase，改用 giftcardsApiService |
| `src/hooks/useMerchantConfig.ts` | cards/vendors/providers 增删改 → giftcardsApiService |
| `src/services/export/orderImportService.ts` | cards/vendors/payment_providers → listCardsApi/listVendorsApi/listPaymentProvidersApi |
| `src/components/ShiftHandoverTab.tsx` | vendors/payment_providers → giftcardsApiService |
| `src/hooks/useReportData.ts` | cards/vendors/payment_providers → giftcardsApiService |
| `src/services/export/exportService.ts` | cards/vendors/payment_providers → giftcardsApiService |
| `src/hooks/useActivityDataContent.ts` | payment_providers → listPaymentProvidersApi |
| `src/services/finance/balanceLogRepairService.ts` | vendors/payment_providers → giftcardsApiService |
| `src/services/finance/balanceLogReconcileService.ts` | vendors/payment_providers → giftcardsApiService |
| `server/src/modules/giftcards/repository.ts` | 新增 cards/vendors/providers 完整 CRUD |
| `server/src/modules/giftcards/service.ts` | 新增对应 service，含重命名级联逻辑 |
| `server/src/modules/giftcards/controller.ts` | 新增全部 controller |
| `server/src/modules/giftcards/routes.ts` | 新增 /cards、/vendors、/providers 路由 |
| `server/src/modules/giftcards/types.ts` | 新增类型定义 |

---

## 三、替换调用数量

| 类型 | 替换前 | 替换后 |
|------|--------|--------|
| supabase.from('cards') | 20 | 0 |
| supabase.from('vendors') | 20 | 0 |
| supabase.from('payment_providers') | 20 | 0 |
| **合计** | **60** | **0** |

---

## 四、新 API 列表

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/giftcards | 兼容旧接口，返回 active cards |
| GET | /api/giftcards/cards | 卡片列表（可选 ?status=） |
| GET | /api/giftcards/cards/:id | 单个卡片 |
| POST | /api/giftcards/cards | 创建卡片 |
| PUT | /api/giftcards/cards/:id | 更新卡片 |
| DELETE | /api/giftcards/cards/:id | 删除卡片 |
| GET | /api/giftcards/vendors | 卡商列表 |
| GET | /api/giftcards/vendors/:id | 单个卡商 |
| POST | /api/giftcards/vendors | 创建卡商 |
| PUT | /api/giftcards/vendors/:id | 更新卡商（含重命名级联） |
| DELETE | /api/giftcards/vendors/:id | 删除卡商 |
| GET | /api/giftcards/providers | 支付渠道列表 |
| GET | /api/giftcards/providers/:id | 单个支付渠道 |
| POST | /api/giftcards/providers | 创建支付渠道 |
| PUT | /api/giftcards/providers/:id | 更新支付渠道（含重命名级联） |
| DELETE | /api/giftcards/providers/:id | 删除支付渠道 |

---

## 五、剩余 Supabase 调用（giftcards 相关）

| 文件 | 调用 | 说明 |
|------|------|------|
| merchantConfigStore.ts | card_types | 卡片类型配置，非 cards 表 |
| useMerchantConfig.ts | supabase channel | Realtime 订阅，保留 |

**activity_gifts**、**delete_activity_gift_and_restore** 属于活动赠送模块，不在本次 giftcards 迁移范围内。

---

## 六、修改的 Hooks

| Hook | 变更 |
|------|------|
| useMerchantConfig (useCards) | 完全迁移至 API |
| useMerchantConfig (useVendors) | 完全迁移至 API |
| useMerchantConfig (usePaymentProviders) | 完全迁移至 API |

**说明**：项目中无独立的 `useGiftcards`、`useGiftcardList`、`useGiftcardDetail`，礼品卡相关数据通过 `useMerchantConfig` 的 `useCards`、`useVendors`、`usePaymentProviders` 获取。

---

## 七、系统验证结果

| 验证项 | 状态 |
|--------|------|
| 前端构建 | ✅ 通过 |
| 后端构建 | ✅ 通过 |
| 礼品卡列表加载 | 待运行时验证 |
| 礼品卡创建 | 待运行时验证 |
| 卡商/支付渠道 CRUD | 待运行时验证 |
| 订单导入（cards/vendors 映射） | 待运行时验证 |
| 交班结算（vendors/providers） | 待运行时验证 |

**验证步骤**：
1. 启动后端：`cd server && npm run dev`
2. 启动前端：`npm run dev`
3. 登录后测试：商家配置（卡片/卡商/代付商家）的增删改查、排序
