# IMPLEMENTATION REPORT — Orders Page RPC Migration

## FILES FOUND USING DIRECT ORDERS QUERY

| File | Usage | On Orders Page? |
|------|-------|----------------|
| `src/components/GlobalSearch.tsx` | `.from('orders').select(...)` for search | Yes (in Header layout) |
| `src/hooks/orders/useOrderMutations.ts` | `.from('orders').insert().select('*, members(member_code)')` | Yes (add order) |
| `src/hooks/orders/useUsdtOrderMutations.ts` | `.from('orders').insert().select('*, members(member_code)')` | Yes (add USDT order) |
| `src/hooks/orders/orderQueries.ts` | **Uses RPC only** ✓ | Yes |
| `src/hooks/orders/useOrderList.ts` | **Uses fetchOrdersFromDb (RPC)** ✓ | Yes |
| `src/hooks/orders/useOrderStats.ts` | **Uses fetchOrderStats (RPC)** ✓ | Yes |

Other files with direct orders access (not on Orders page load):
- `ProfitComparisonTab.tsx` (ReportManagement)
- `ReportManagement.tsx`, `OperationLogs.tsx`, `CustomerQuery.tsx`, etc.

---

## FILES MODIFIED

1. **src/components/GlobalSearch.tsx**
   - Replaced `supabase.from('orders').select(...)` with RPC
   - Now uses `getMyTenantOrdersFull` / `getMyTenantUsdtOrdersFull` (or `getTenantOrdersFull` for platform admin)
   - Added tenant context (useTenantView, useAuth) for correct RPC selection

2. **src/hooks/orders/useOrderMutations.ts**
   - Removed `members(member_code)` join from `.insert().select()`
   - Changed to `.select('*')` and use `memberCode` / `member_code_snapshot` from input

3. **src/hooks/orders/useUsdtOrderMutations.ts**
   - Same: removed members join, use `member_code_snapshot` from response

---

## NEW BUNDLE NAME

- Main: `index-DjI3e3ur.js` (different from previous `index-BtgNkiTm.js`)
- OrderManagement chunk: `OrderManagement-C37gbRTm.js`

---

## VERIFY RESULT

**RPC requests present:** YES  
- `orderQueries.ts` → `getMyTenantOrdersFull`, `getMyTenantUsdtOrdersFull`  
- `useOrderList` / `useUsdtOrderList` → `fetchOrdersFromDb` / `fetchUsdtOrdersFromDb` (RPC)  
- `useOrderStats` → `fetchOrderStats` (RPC)  
- `GlobalSearch` → RPC when searching orders  

**Orders query removed from Orders page flow:** YES  
- List load: RPC only  
- Stats: RPC only  
- Search (when user types): RPC only  
- Add order: INSERT remains (no RPC for writes); SELECT after insert uses `*` only (no members join)

---

## VERIFICATION STEPS

1. Open browser DevTools → Network
2. Reload Orders page (`/orders`)
3. Filter for `rpc` — expect:
   - `/rest/v1/rpc/get_my_tenant_orders_full`
   - `/rest/v1/rpc/get_my_tenant_usdt_orders_full`
   - `/rest/v1/rpc/get_my_tenant_members_full`
4. Ensure NO requests like `/rest/v1/orders?select=*`
5. Expected: Orders list loads (~808 records for tenant 002)

---

## BUILD COMMANDS

```bash
npm run build
npm run dev   # or npm run preview for production build
```
