/**
 * AuditSettings — 审核设置的唯一类型定义。
 *
 * 存储于 shared_data_store，key = 'auditSettings'。
 * 旧版 DEFAULT_SHARED_DATA 中曾使用 { requireApproval, approvers } 形状，
 * 已在本次统一中修正为以下结构。
 *
 * 注意：下列「可审核字段」必须与业务页实际参与 submitBatchForApproval 的 fieldKey
 * 及 WORKFLOW_TO_AUDIT_SETTING_KEY 映射一致；只读字段（如会员编号、录入人）不得列入。
 */

export interface AuditSettings {
  orderFields: string[];
  memberFields: string[];
  activityFields: string[];
  orderOperations?: string[];
  /** 默认 false：关闭时会员等级仅由累计积分自动计算，后台不可手改 */
  allow_manual_member_level?: boolean;
}

export const DEFAULT_AUDIT_SETTINGS: AuditSettings = {
  orderFields: [],
  memberFields: [],
  activityFields: [],
  orderOperations: [],
  allow_manual_member_level: false,
};

/** 审核设置中允许的 key 集合（用于过滤历史脏数据） */
export const ORDER_AUDIT_FIELD_KEY_SET = new Set<string>();
export const MEMBER_AUDIT_FIELD_KEY_SET = new Set<string>();
export const ACTIVITY_AUDIT_FIELD_KEY_SET = new Set<string>();
export const ORDER_OPERATION_KEY_SET = new Set<string>();

/** 安全合并：无论数据库存的是旧格式还是新格式，都返回正确的 AuditSettings；并剔除已废弃的勾选项。 */
export function mergeAuditSettings(raw: unknown): AuditSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_AUDIT_SETTINGS };
  const obj = raw as Record<string, unknown>;

  const filterKeys = (arr: unknown, allowed: Set<string>): string[] => {
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === "string" && allowed.has(x));
  };

  return {
    orderFields: filterKeys(obj.orderFields, ORDER_AUDIT_FIELD_KEY_SET),
    memberFields: filterKeys(obj.memberFields, MEMBER_AUDIT_FIELD_KEY_SET),
    activityFields: filterKeys(obj.activityFields, ACTIVITY_AUDIT_FIELD_KEY_SET),
    orderOperations: filterKeys(obj.orderOperations, ORDER_OPERATION_KEY_SET),
    allow_manual_member_level: obj.allow_manual_member_level === true,
  };
}

// ---- 审核字段定义（用于 AuditCenter UI + workflow 映射对齐） ----

export interface AuditFieldDef {
  key: string;
  label_zh: string;
  label_en: string;
}

/**
 * 订单：与 OrderManagement 编辑弹窗中非管理员会提交的 fieldKey 一致
 *（不含会员编号/销售员等只读或仅总管理员可改项）
 */
export const ORDER_AUDIT_FIELDS: AuditFieldDef[] = [
  { key: "phone", label_zh: "电话号码", label_en: "Phone Number" },
  { key: "cardType", label_zh: "卡片类型", label_en: "Card Type" },
  { key: "cardValue", label_zh: "卡片面值", label_en: "Card Value" },
  { key: "cardRate", label_zh: "卡片汇率", label_en: "Card Rate" },
  { key: "paidAmount", label_zh: "实付外币 / 实付USDT", label_en: "Actual paid (foreign / USDT)" },
  { key: "paymentValue", label_zh: "代付价值", label_en: "Payment value" },
  { key: "foreignCurrencyRate", label_zh: "外币汇率 / USDT汇率", label_en: "FX / USDT rate" },
  { key: "fee", label_zh: "手续费", label_en: "Fee" },
  { key: "currency", label_zh: "需求币种", label_en: "Demand Currency" },
  { key: "paymentProvider", label_zh: "代付商家", label_en: "Payment Provider" },
  { key: "vendor", label_zh: "卡商", label_en: "Card Vendor" },
  { key: "remark", label_zh: "备注", label_en: "Remark" },
];

/**
 * 会员：与 MemberManagementContent handleSaveEdit 中收集的 changes 一致
 *（手机号/编号/录入人为只读，推荐人未进入审核 diff，删除未走审核流）
 */
export const MEMBER_AUDIT_FIELDS: AuditFieldDef[] = [
  { key: "level", label_zh: "会员等级", label_en: "Member Level" },
  { key: "remark", label_zh: "备注", label_en: "Remark" },
  { key: "customerFeature", label_zh: "客户特点", label_en: "Customer Feature" },
  { key: "commonCards", label_zh: "常交易卡", label_en: "Common Cards" },
  { key: "bankCard", label_zh: "银行卡", label_en: "Bank Card" },
  { key: "currencyPreferences", label_zh: "币种偏好", label_en: "Currency Preferences" },
  { key: "sourceId", label_zh: "来源", label_en: "Source" },
  { key: "referrer", label_zh: "推荐人", label_en: "Referrer" },
];

/** 活动赠送：与 ActivityReports 编辑赠送记录时提交的 changes 一致 */
export const ACTIVITY_AUDIT_FIELDS: AuditFieldDef[] = [
  { key: "currency", label_zh: "赠送币种", label_en: "Gift Currency" },
  { key: "amount", label_zh: "赠送金额", label_en: "Gift Amount" },
  { key: "rate", label_zh: "汇率", label_en: "Exchange Rate" },
  { key: "phone", label_zh: "电话号码", label_en: "Phone Number" },
  { key: "paymentAgent", label_zh: "代付商家", label_en: "Payment Provider" },
  { key: "giftType", label_zh: "类型", label_en: "Type" },
  { key: "remark", label_zh: "备注", label_en: "Remark" },
];

export const ORDER_OPERATION_FIELDS: AuditFieldDef[] = [
  { key: "cancelOrder", label_zh: "取消订单", label_en: "Cancel Order" },
  { key: "deleteOrder", label_zh: "删除订单", label_en: "Delete Order" },
];

ORDER_AUDIT_FIELDS.forEach((f) => ORDER_AUDIT_FIELD_KEY_SET.add(f.key));
MEMBER_AUDIT_FIELDS.forEach((f) => MEMBER_AUDIT_FIELD_KEY_SET.add(f.key));
ACTIVITY_AUDIT_FIELDS.forEach((f) => ACTIVITY_AUDIT_FIELD_KEY_SET.add(f.key));
ORDER_OPERATION_FIELDS.forEach((f) => ORDER_OPERATION_KEY_SET.add(f.key));

const AUDIT_SETTINGS_STORE_KEYS = [
  'orderFields',
  'memberFields',
  'activityFields',
  'orderOperations',
  'allow_manual_member_level',
] as const;

const AUDIT_SETTINGS_ARRAY_KEYS = ['orderFields', 'memberFields', 'activityFields', 'orderOperations'] as const;

function countNonWhitelistedAuditKeys(arr: unknown, allowed: Set<string>): number {
  if (!Array.isArray(arr)) return 0;
  return arr.filter((x) => typeof x !== 'string' || !allowed.has(x)).length;
}

/**
 * 存储中的 auditSettings 是否含有：未知顶层字段、非数组的列表字段、或不在现行业务字段列表内的勾选项。
 * 为 true 时应将 `mergeAuditSettings(raw)` 写回 shared_data_store，与审核中心 UI 一致并避免脏数据长期残留。
 */
export function auditSettingsNeedsSanitizePersist(raw: unknown): boolean {
  if (raw == null || typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  const knownTop = new Set<string>(AUDIT_SETTINGS_STORE_KEYS);
  for (const key of Object.keys(obj)) {
    if (!knownTop.has(key)) return true;
  }
  if (
    obj.allow_manual_member_level !== undefined &&
    typeof obj.allow_manual_member_level !== 'boolean'
  ) {
    return true;
  }
  for (const k of AUDIT_SETTINGS_ARRAY_KEYS) {
    const v = obj[k];
    if (v === undefined) continue;
    if (!Array.isArray(v)) return true;
  }
  return (
    countNonWhitelistedAuditKeys(obj.orderFields, ORDER_AUDIT_FIELD_KEY_SET) > 0 ||
    countNonWhitelistedAuditKeys(obj.memberFields, MEMBER_AUDIT_FIELD_KEY_SET) > 0 ||
    countNonWhitelistedAuditKeys(obj.activityFields, ACTIVITY_AUDIT_FIELD_KEY_SET) > 0 ||
    countNonWhitelistedAuditKeys(obj.orderOperations, ORDER_OPERATION_KEY_SET) > 0
  );
}
