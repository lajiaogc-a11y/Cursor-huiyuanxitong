# 外部 API / Token / 类型 / 报表利润汇总（第二轮）

## 1. 外部 API URL

- **前端**：`src/config/externalApis.ts` → `EXTERNAL_API`
- **后端**：`server/src/config/externalApis.ts`（内容需与前端同步维护）
- **已替换引用**：`ExchangeRate.tsx`、`pointsSettingsStore.ts`、`exchangeRateStore.ts`、`PublicRates.tsx`、`BtcPriceSettingsCard.tsx`（直连兜底）、`server/.../data/routes.ts`

Supabase Edge 的 **slug** 已集中在 `SUPABASE_EDGE_FUNCTIONS` + `buildSupabaseEdgeUrl`（前后端 `externalApis.ts`）。第三方 P2P（OKX/Binance 等）仍写在 `server/.../data/routes.ts` 的 `fetch-usdt-rates` 处理器内，可按需再抽到 `EXTERNAL_API`。

## 2. JWT / Authorization 统一

- `src/lib/apiClient.ts` 导出：
  - `API_ACCESS_TOKEN_KEY`、`MEMBER_ACCESS_TOKEN_KEY`
  - `resolveBearerTokenForPath(path)`：与 `apiClient` 请求一致的选 token 规则
  - `getBearerTokenStaffThenMember()`：员工优先、否则会员（用于手写 `fetch`）
- `src/integrations/supabase/client.ts` 改为使用 `resolveBearerTokenForPath`，避免与 `apiClient` 分叉。
- `src/api/client.ts` 再导出上述 token 常量，供 `AuthContext` 等使用。
- `BtcPriceSettingsCard`、`memberPortalLiveUpdateService`、`AuthContext` 已去掉硬编码键名或重复逻辑。

## 3. 前后端类型对齐（订单列表摘要）

- **前端**：`src/types/orderListSummary.ts` → `OrderListSummary`
- **后端**：`server/src/types/orderListSummary.ts`（字段须与前端一致）
- `server/src/modules/orders/types.ts` 现为：`export type { OrderListSummary as Order } from "../../types/orderListSummary.js"`
- `src/services/orders/ordersApiService.ts` 中 `ApiOrder` 使用 `OrderListSummary & Record<string, unknown>` 表示「摘要列 + 动态列」

> 说明：前端 `hooks/orders/types.ts` 的 `Order` 是 **UI/表单模型**，与 DB 行不同，未强行合并。

## 4. 报表利润 reduce

- **新模块**：`src/lib/reportProfitAggregates.ts`
- **ReportManagement.tsx**：全局正利润、员工正负利润桶、卡片/卡商报表中的 NGN/USDT 利润汇总已改用上述函数。

## 5. Git 提交建议

```bash
git add -A
git commit -m "refactor: external API constants, unify JWT helpers, order list types, report profit aggregates"
```
