import { ColumnConfig } from "@/hooks/ui/useColumnVisibility";
import { Order, UsdtOrder } from "@/hooks/orders";

// UUID 校验函数 - 防止把姓名字符串写入 uuid 字段
const isUuid = (str: string): boolean => {
  if (!str || typeof str !== "string") return false;
  return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str);
};

/** 订单编辑里 salesPerson 可能是员工 UUID，也可能是 nameResolver 解析后的姓名，统一解析为 employees.id */
export function resolveOrderSalesEmployeeId(
  salesPersonField: string | undefined,
  employees: { id: string; real_name: string }[],
): string | null {
  const s = String(salesPersonField ?? "").trim();
  if (!s) return null;
  if (isUuid(s)) return s;
  const byName = employees.find((e) => e.real_name === s);
  return byName?.id ?? null;
}

// 订单状态选项 - 移到组件内部使用 t() 函数
export const getOrderStatusOptions = (t: (zh: string, en: string) => string) => [
  { value: "all", label: t("全部状态", "All Status") },
  { value: "cancelled", label: t("已取消", "Cancelled") },
  { value: "completed", label: t("已完成", "Completed") },
];

// 币种选项 - 移到组件内部使用 t() 函数
export const getCurrencyOptions = (t: (zh: string, en: string) => string) => [
  { value: "all", label: t("全部币种", "All Currencies") },
  { value: "NGN", label: t("奈拉 (NGN)", "Naira (NGN)") },
  { value: "GHS", label: t("赛地 (GHS)", "Cedi (GHS)") },
  { value: "USDT", label: "USDT" },
];

// 普通订单列配置 - 移到组件内部使用 t() 函数
export const getNormalOrderColumns = (t: (zh: string, en: string) => string): ColumnConfig[] => [
  { key: "createdAt", label: t("创建时间", "Created at") },
  { key: "id", label: t("订单ID", "Order ID") },
  { key: "cardType", label: t("卡片类型", "Card Type") },
  { key: "cardValue", label: t("卡片面值", "Card Value") },
  { key: "cardRate", label: t("卡片汇率", "Card Rate") },
  { key: "cardWorth", label: t("此卡价值", "Card Worth") },
  { key: "actualPaid", label: t("实付外币", "Actual Paid") },
  { key: "foreignRate", label: t("外币汇率", "Foreign Rate") },
  { key: "fee", label: t("手续费", "Fee") },
  { key: "paymentValue", label: t("代付价值", "Payment Value") },
  { key: "paymentProvider", label: t("代付商家", "Payment Provider") },
  { key: "vendor", label: t("卡商名称", "Vendor") },
  { key: "profit", label: t("本单利润", "Profit") },
  { key: "profitRate", label: t("本单利率", "Profit Rate") },
  { key: "phoneNumber", label: t("电话号码", "Phone") },
  { key: "memberCode", label: t("会员编号", "Member Code") },
  { key: "demandCurrency", label: t("需求币种", "Demand Currency") },
  { key: "salesPerson", label: t("销售员", "Salesperson") },
  { key: "remark", label: t("备注", "Remark") },
  { key: "status", label: t("状态", "Status") },
  { key: "actions", label: t("操作", "Actions") },
];

// USDT订单列配置 - 移到组件内部使用 t() 函数
export const getUsdtOrderColumns = (t: (zh: string, en: string) => string): ColumnConfig[] => [
  { key: "createdAt", label: t("创建时间", "Created at") },
  { key: "id", label: t("订单ID", "Order ID") },
  { key: "cardType", label: t("卡片类型", "Card Type") },
  { key: "cardValue", label: t("卡片面值", "Card Value") },
  { key: "cardRate", label: t("卡片汇率", "Card Rate") },
  { key: "cardWorth", label: t("此卡价值", "Card Worth") },
  { key: "usdtRate", label: t("USDT汇率", "USDT Rate") },
  { key: "totalValueUsdt", label: t("总价值USDT", "Total Value (USDT)") },
  { key: "actualPaidUsdt", label: t("实付USDT", "Actual Paid (USDT)") },
  { key: "feeUsdt", label: t("手续费USDT", "Fee (USDT)") },
  { key: "paymentValue", label: t("代付价值", "Payment Value") },
  { key: "profit", label: t("本单利润", "Profit") },
  { key: "profitRate", label: t("本单利率", "Profit Rate") },
  { key: "vendor", label: t("卡商名称", "Vendor") },
  { key: "paymentProvider", label: t("代付商家", "Payment Provider") },
  { key: "phoneNumber", label: t("电话号码", "Phone") },
  { key: "memberCode", label: t("会员编号", "Member Code") },
  { key: "demandCurrency", label: t("需求币种", "Demand Currency") },
  { key: "salesPerson", label: t("销售员", "Salesperson") },
  { key: "remark", label: t("备注", "Remark") },
  { key: "status", label: t("状态", "Status") },
  { key: "actions", label: t("操作", "Actions") },
];

export type OrderAuditChange = { fieldKey: string; oldValue: unknown; newValue: unknown };

export function computeNormalOrderFieldChanges(
  editing: Order,
  original: Order,
  isSuperAdmin: boolean,
): OrderAuditChange[] {
  const changes: OrderAuditChange[] = [];
  const numDiff = (a: unknown, b: unknown) => parseFloat(String(a || 0)) !== parseFloat(String(b || 0));
  const strDiff = (a: unknown, b: unknown) => String(a || "") !== String(b || "");
  if (strDiff(editing.cardType, original.cardType)) {
    changes.push({ fieldKey: "card_type", oldValue: original.cardType, newValue: editing.cardType });
  }
  if (numDiff(editing.cardValue, original.cardValue)) {
    changes.push({ fieldKey: "card_value", oldValue: original.cardValue, newValue: editing.cardValue });
  }
  if (numDiff(editing.cardRate, original.cardRate)) {
    changes.push({ fieldKey: "card_rate", oldValue: original.cardRate, newValue: editing.cardRate });
  }
  if (numDiff(editing.actualPaid, original.actualPaid)) {
    changes.push({ fieldKey: "actual_paid", oldValue: original.actualPaid, newValue: editing.actualPaid });
  }
  if (numDiff(editing.paymentValue, original.paymentValue)) {
    changes.push({ fieldKey: "payment_value", oldValue: original.paymentValue, newValue: editing.paymentValue });
  }
  if (numDiff(editing.foreignRate, original.foreignRate)) {
    changes.push({ fieldKey: "foreign_rate", oldValue: original.foreignRate, newValue: editing.foreignRate });
  }
  if (numDiff(editing.fee, original.fee)) {
    changes.push({ fieldKey: "fee", oldValue: original.fee, newValue: editing.fee });
  }
  if (strDiff(editing.demandCurrency, original.demandCurrency)) {
    changes.push({ fieldKey: "demand_currency", oldValue: original.demandCurrency, newValue: editing.demandCurrency });
  }
  if (strDiff(editing.phoneNumber, original.phoneNumber)) {
    changes.push({ fieldKey: "phone_number", oldValue: original.phoneNumber, newValue: editing.phoneNumber });
  }
  if (strDiff(editing.paymentProvider, original.paymentProvider)) {
    changes.push({ fieldKey: "payment_provider", oldValue: original.paymentProvider, newValue: editing.paymentProvider });
  }
  if (strDiff(editing.vendor, original.vendor)) {
    changes.push({ fieldKey: "vendor", oldValue: original.vendor, newValue: editing.vendor });
  }
  if (strDiff(editing.remark, original.remark)) {
    changes.push({ fieldKey: "remark", oldValue: original.remark, newValue: editing.remark });
  }
  if (isSuperAdmin && strDiff(editing.salesPerson, original.salesPerson)) {
    changes.push({ fieldKey: "sales_person", oldValue: original.salesPerson, newValue: editing.salesPerson });
  }
  return changes;
}

export function computeUsdtOrderFieldChanges(
  editing: UsdtOrder,
  original: UsdtOrder,
  isSuperAdmin: boolean,
): OrderAuditChange[] {
  const changes: OrderAuditChange[] = [];
  if (editing.cardType !== original.cardType) {
    changes.push({ fieldKey: "card_type", oldValue: original.cardType, newValue: editing.cardType });
  }
  if (editing.cardValue !== original.cardValue) {
    changes.push({ fieldKey: "card_value", oldValue: original.cardValue, newValue: editing.cardValue });
  }
  if (editing.cardRate !== original.cardRate) {
    changes.push({ fieldKey: "card_rate", oldValue: original.cardRate, newValue: editing.cardRate });
  }
  if (editing.usdtRate !== original.usdtRate) {
    changes.push({ fieldKey: "usdt_rate", oldValue: original.usdtRate, newValue: editing.usdtRate });
  }
  if (editing.actualPaidUsdt !== original.actualPaidUsdt) {
    changes.push({ fieldKey: "actual_paid", oldValue: original.actualPaidUsdt, newValue: editing.actualPaidUsdt });
  }
  if (editing.phoneNumber !== original.phoneNumber) {
    changes.push({ fieldKey: "phone_number", oldValue: original.phoneNumber, newValue: editing.phoneNumber });
  }
  if (editing.paymentProvider !== original.paymentProvider) {
    changes.push({ fieldKey: "payment_provider", oldValue: original.paymentProvider, newValue: editing.paymentProvider });
  }
  if (editing.vendor !== original.vendor) {
    changes.push({ fieldKey: "vendor", oldValue: original.vendor, newValue: editing.vendor });
  }
  if (editing.feeUsdt !== original.feeUsdt) {
    changes.push({ fieldKey: "fee", oldValue: original.feeUsdt, newValue: editing.feeUsdt });
  }
  if (editing.remark !== original.remark) {
    changes.push({ fieldKey: "remark", oldValue: original.remark, newValue: editing.remark });
  }
  if (isSuperAdmin && editing.salesPerson !== original.salesPerson) {
    changes.push({ fieldKey: "sales_person", oldValue: original.salesPerson, newValue: editing.salesPerson });
  }
  return changes;
}
