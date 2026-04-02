# 资源/连接 自检报告

## 一、已正确清理的项 ✓

| 模块 | 类型 | 清理位置 |
|------|------|----------|
| RealtimeContext | dataRefreshManager + realtimeManager | employee 变为 null 时 useEffect 清理 |
| cacheManager | Supabase channels | signOut → cleanupCacheManager → unsubscribeAll |
| useReferrals, useMembers, usePointsLedger 等 | addEventListener + channels | useEffect return |
| MemberPortalSettings, ExchangeRate 等 | setInterval | return () => clearInterval |
| MemberSpin | setInterval (tickTimerRef) | useEffect return → stopSpinTickSound |
| MerchantSettlement | addEventListener + channels + setTimeout | useEffect return |
| OrderManagement | channel + refreshTimeoutId | useEffect return |
| useMemberPortalSettings | setInterval + addEventListener + channel | useEffect return |
| customerSourceStore | channel | return supabase.removeChannel |
| sharedDataService.subscribeSharedData | channel | 返回的 unsubscribe 中 removeChannel |

## 二、发现的问题与修复

### 1. 后端 PG Pool 无优雅关闭（已修复）

`server/src/database/pg.ts` 的 pool 是单例，进程退出时未主动关闭，可能导致连接残留。

**修复**：在 `server/src/app.ts` 中增加 SIGTERM/SIGINT 时 `pool.end()`。

### 2. 需人工复核的潜在点

- **ExchangeRate.tsx**：存在多个 setInterval（BTC 轮询、memo 未读、usdtFee、currencyRatesCountdown、cashSpecialRefresh），均已确认有 `return () => clearInterval`。
- **ActivityGiftTab / ActivityGiftDialog**：saveTimeoutId 需确认在 unmount 时 clearTimeout（若存在竞态）。

## 三、总结

前端 Realtime / 定时器 / 事件监听 的清理链路完整；登出时通过 RealtimeContext（employee=null）和 cleanupCacheManager 正确释放。后端补充了 PG Pool 的优雅关闭。
