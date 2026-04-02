# 构建告警跟踪（技术债）

本文件记录 **`npm run build`（Vite）** 中可复现的告警来源，便于按周处理。**当前仓库构建仍以 exit 0 成功**；以下为待优化项。

## 1. Vite：动态 import 与静态 import 混用（chunk 提示）

**已处理（2026-03-24）**：`RateCalculator.tsx`、`ExchangeRate.tsx` 已改为对 `memberLookupService` **静态导入**，与 `MemberEntryTab.tsx` 一致，构建日志中**不再**出现该模块的混用告警。

**仍待后续统一**（构建日志中仍会出现同类提示）：

- `cacheManager.ts`、`sharedDataService.ts`、`sonner`、`auditLogStore.ts`、`operatorService.ts`、`nameResolver.ts`、`giftcardsApiService.ts`、`employees.ts` 等：对低频重页面可改为纯动态导入，对全局高频依赖保持纯静态导入，避免混用。

## 2. Tailwind / CSS 类名（历史）

曾出现 **在源码字符串中使用类似 `/[-:.TZ]/g` 的正则**，被 Tailwind JIT 误当作类名片段扫描，产生无效 CSS 告警。处理方式为抽离到独立工具模块（如 `src/lib/isoTimestampDigits.ts`），**避免在含 Tailwind 扫描的模板字符串中直接写 `TZ`、裸 `-` 等易被解析的片段**。

若后续仍出现 CSS 相关告警，请在本节追加：**源文件路径 + 告警原文一行**。
