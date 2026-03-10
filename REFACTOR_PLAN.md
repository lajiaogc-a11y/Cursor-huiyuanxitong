# 系统级架构重构计划

> **重要约束**：本次重构**禁止修改**任何现有业务/计算逻辑（金额计算、余额变更、分润、汇率换算等）。所有改动仅限于代码拆分、重命名、提取函数与移动调用位置。

---

## 一、现状分析

### 1.1 超大组件（>2000 行）

| 文件 | 行数 | 说明 |
|------|------|------|
| `OrderManagement.tsx` | ~2407 | 订单管理页，含筛选、表格、分页、移动端、编辑弹窗 |
| `ExchangeRate.tsx` | ~2553 | 汇率计算页，含 RateCalculator、订单提交、多 Tab |
| `MerchantSettlement.tsx` | ~2085 | 商家结算页，卡商/代付结算、提款/充值 |
| `ReportManagement.tsx` | ~2070 | 报表管理页，多报表类型、导出 |
| `MemberActivityDataContent.tsx` | ~1886 | 会员活动数据内容 |

### 1.2 超大 Hook（>1000 行）

| 文件 | 行数 | 职责 |
|------|------|------|
| `useOrders.ts` | ~1559 | 订单查询、USDT 订单、增删改、实时订阅、积分、余额日志 |

### 1.3 超大 Service（>1000 行）

| 文件 | 行数 | 职责 |
|------|------|------|
| `dataExportImportService.ts` | ~1914 | 表配置、导出、导入、订单导入、会员导入等 |
| `pointsService.ts` | ~1138 | 积分创建、冲正、恢复、推荐积分、编辑调整 |

### 1.4 性能现状

- **订单列表**：已实现服务端分页（每页 50 条）✅
- **操作日志**：已实现服务端分页（每页 50 条）✅
- **审计日志**：需确认 `useAuditRecords` / `AuditCenter` 是否全量拉取

### 1.5 UI 重复模式

- **AlertDialog**：约 20+ 处内联使用，模式相似
- **DangerConfirmDialog**：已存在 `danger-confirm-dialog.tsx`，使用率低
- **空状态**：多处 `text-center py-8 text-muted-foreground` 重复
- **表格布局**：Card + Table + Pagination 结构重复

---

## 二、重构计划

### 阶段一：公共组件与目录结构（低风险）

#### 1.1 新增统一组件

| 组件 | 路径 | 说明 |
|------|------|------|
| `ConfirmDialog` | `components/dialogs/ConfirmDialog.tsx` | 通用确认弹窗，封装 AlertDialog |
| `EmptyState` | `components/empty-state/EmptyState.tsx` | 统一空状态，支持 icon、文案、操作按钮 |
| `TableLayout` | `components/layouts/TableLayout.tsx` | 表格页通用布局：标题、筛选区、表格、分页 |

#### 1.2 目录结构优化（渐进式）

```
src/
├── components/
│   ├── ui/           # 保留，基础 UI
│   ├── dialogs/      # 新增，弹窗类
│   ├── empty-state/  # 新增
│   ├── layouts/      # 新增，页面布局
│   └── tables/       # 新增，表格相关（可选）
├── hooks/
│   ├── orders/       # 新增目录，拆分 useOrders
│   ├── members/
│   └── ...
├── services/
│   ├── orders/       # 新增，订单相关服务
│   ├── settlements/  # 新增，结算相关
│   ├── reports/      # 新增，报表相关
│   └── export/       # 新增，导出导入
└── pages/
```

---

### 阶段二：OrderManagement 拆分（中风险）

**目标**：将 2407 行拆为 5–7 个子组件，每个 300–500 行。

| 子组件 | 职责 | 预估行数 |
|--------|------|----------|
| `OrderFilters` | 搜索、高级筛选（状态/币种/卡商/代付/卡片/销售员/利润/日期） | ~250 |
| `OrderTable` | 普通订单表格（含列显示、排序、操作列） | ~350 |
| `OrderUsdtTable` | USDT 订单表格 | ~350 |
| `OrderPagination` | 分页控件（含跳页） | ~80 |
| `OrderMobileView` | 移动端卡片列表 | ~200 |
| `OrderEditDialog` | 编辑弹窗（普通/USDT 两套） | ~400 |
| `OrderActions` | 行内操作按钮组（编辑/取消/恢复/删除） | ~100 |

**页面主文件**：仅负责组合、状态提升、调用 hooks，目标 ~200 行。

---

### 阶段三：useOrders Hook 拆分（中风险）

**目标**：将 1559 行拆为 4 个职责单一的 Hook。

| Hook | 职责 | 预估行数 |
|------|------|----------|
| `useOrderList` | 普通订单查询（分页、筛选、tenant 兼容） | ~250 |
| `useUsdtOrderList` | USDT 订单查询 | ~250 |
| `useOrderFilters` | 筛选状态、orderFilters 构建、重置 | ~80 |
| `useOrderMutations` | addOrder、updateOrder、cancelOrder、restoreOrder、deleteOrder | ~500 |
| `useOrderRealtime` | Supabase 订阅、smartInvalidate | ~80 |

**类型与工具函数**：提取到 `hooks/orders/types.ts` 和 `hooks/orders/utils.ts`。

**兼容层**：保留 `useOrders` / `useUsdtOrders` 作为 facade，内部组合上述 hooks，保证现有调用方无需修改。

---

### 阶段四：ExchangeRate 拆分（中风险）

| 子组件 | 职责 | 预估行数 |
|--------|------|----------|
| `RateCalculatorPanel` | 汇率计算器主体 | ~400 |
| `OrderSubmitForm` | 订单提交表单 | ~300 |
| `ExchangeRateTabs` | Tab 切换（计算器/历史等） | ~150 |
| `ExchangeRateMobileView` | 移动端布局 | ~200 |

---

### 阶段五：MerchantSettlement 拆分（中风险）

| 子组件 | 职责 | 预估行数 |
|--------|------|----------|
| `SettlementTabs` | 卡商/代付 Tab | ~100 |
| `CardMerchantSettlement` | 卡商结算内容 | ~400 |
| `PaymentProviderSettlement` | 代付结算内容 | ~400 |
| `WithdrawalForm` | 提款表单 | ~200 |
| `RechargeForm` | 充值表单 | ~200 |

---

### 阶段六：ReportManagement 拆分（中风险）

| 子组件 | 职责 | 预估行数 |
|--------|------|----------|
| `ReportTabs` | 报表类型 Tab | ~100 |
| `ReportFilters` | 日期、筛选条件 | ~150 |
| `ReportContent` | 报表内容区（按类型渲染） | ~400 |
| `ReportExport` | 导出逻辑与按钮 | ~100 |

---

### 阶段七：MemberActivityDataContent 拆分（中风险）

| 子组件 | 职责 | 预估行数 |
|--------|------|----------|
| `MemberActivityFilters` | 会员、日期筛选 | ~150 |
| `MemberActivityTable` | 活动数据表格 | ~350 |
| `MemberActivityCharts` | 图表展示 | ~200 |

---

### 阶段八：Service 层拆分（低-中风险）

#### 8.1 dataExportImportService 拆分

| 新文件 | 职责 | 预估行数 |
|--------|------|----------|
| `export/tableConfig.ts` | EXPORTABLE_TABLES、列配置 | ~300 |
| `export/exportService.ts` | 导出逻辑（CSV/XLSX） | ~400 |
| `export/importService.ts` | 导入解析、校验 | ~400 |
| `export/orderImportService.ts` | 订单导入专用逻辑 | ~400 |
| `export/memberImportService.ts` | 会员导入专用逻辑 | ~300 |
| `export/index.ts` | 统一导出，保持原 API 兼容 | ~50 |

#### 8.2 pointsService 拆分（谨慎）

- 积分逻辑与订单、余额强耦合，**建议暂不拆分**，或仅做最小拆分：
  - `pointsService/core.ts`：createPoints、reversePoints、restorePoints
  - `pointsService/referral.ts`：推荐积分
  - `pointsService/edit.ts`：adjustPointsOnOrderEdit
  - `pointsService/index.ts`：统一导出

---

### 阶段九：性能与审计日志（低风险）

- 检查 `AuditCenter`、`useAuditRecords` 是否全量拉取
- 若为全量，改为服务端分页（每页 50 条，使用 `.range()`）

---

### 阶段十：代码质量（低风险）

1. **删除未使用代码**：通过 ESLint `no-unused-vars`、`ts-prune` 扫描
2. **合并重复逻辑**：如多处相似的 AlertDialog 改为 `ConfirmDialog`
3. **统一 Tailwind**：如 `text-center py-8 text-muted-foreground` 抽取为 `EmptyState` 或工具类

---

## 三、执行顺序建议

| 顺序 | 阶段 | 风险 | 依赖 |
|------|------|------|------|
| 1 | 公共组件（ConfirmDialog、EmptyState、TableLayout） | 低 | 无 |
| 2 | 目录结构（新建 dialogs、empty-state、layouts） | 低 | 无 |
| 3 | useOrders Hook 拆分 | 中 | 无，但影响 OrderManagement |
| 4 | OrderManagement 拆分 | 中 | 阶段 1、3 |
| 5 | dataExportImportService 拆分 | 中 | 无 |
| 6 | ExchangeRate 拆分 | 中 | 阶段 1 |
| 7 | MerchantSettlement 拆分 | 中 | 阶段 1 |
| 8 | ReportManagement 拆分 | 中 | 阶段 1 |
| 9 | MemberActivityDataContent 拆分 | 中 | 阶段 1 |
| 10 | 审计日志分页 + 代码质量 | 低 | 无 |

---

## 四、验收标准

1. **功能不变**：所有现有功能行为一致，无回归
2. **单文件行数**：页面组件 ≤500 行，子组件 ≤400 行，Hook ≤400 行
3. **API 兼容**：`useOrders`、`useUsdtOrders` 对外接口保持不变
4. **构建通过**：`npm run build` 无错误
5. **业务逻辑零改动**：金额、积分、余额、分润、汇率等计算与写入逻辑完全不变

---

## 五、回滚策略

- 每个阶段独立提交，便于回滚
- 使用 facade 模式保持旧 API，新实现可逐步替换
- 不删除旧文件直至新实现稳定

---

**请确认此计划后，再开始按阶段执行代码修改。**
