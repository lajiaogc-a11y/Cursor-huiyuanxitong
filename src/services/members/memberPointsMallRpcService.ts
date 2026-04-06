/**
 * 积分商城相关 RPC（/api/data/rpc/*）
 */
import { apiPost } from "@/api/client";

export interface PointsMallCategory {
  id: string;
  name_zh: string;
  name_en: string;
  sort_order: number;
}

export interface PointsMallItem {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  points_cost: number;
  stock_remaining: number;
  per_order_limit: number;
  per_user_daily_limit: number;
  per_user_lifetime_limit: number;
  /** 后台配置的展示分类（可空） */
  mall_category_id?: string | null;
  /** 本租户内全站兑换量合计（含所有会员，不含 rejected），用于「受欢迎的」排序 */
  tenant_redeem_qty?: number;
  /** 会员今日该商品已成功兑换件数（不含 rejected） */
  used_today?: number;
  /** 会员该商品累计已成功兑换件数（不含 rejected） */
  used_lifetime?: number;
  enabled?: boolean;
  sort_order?: number;
}

export async function listMyPointsMallItems(tenantId?: string | null): Promise<PointsMallItem[]> {
  const data = await apiPost<unknown>("/api/data/rpc/list_my_member_points_mall_items", {
    ...(tenantId ? { p_tenant_id: tenantId } : {}),
  });
  const r = (data || {}) as { success?: boolean; error?: string; items?: PointsMallItem[] };
  if (!r.success) throw new Error(r.error || "Load points mall items failed");
  return (r.items || []) as PointsMallItem[];
}

export async function upsertMyPointsMallItems(
  items: Omit<PointsMallItem, "id">[] | PointsMallItem[],
  tenantId?: string | null,
): Promise<void> {
  const uuidRe = /^[0-9a-f-]{36}$/i;
  const payload = items.map((x, idx) => {
    const rawId = x.id != null ? String(x.id).trim() : "";
    const rawCat = x.mall_category_id != null ? String(x.mall_category_id).trim() : "";
    return {
      ...(uuidRe.test(rawId) ? { id: rawId } : {}),
      title: String(x.title ?? "").trim(),
      description: String(x.description ?? "").trim() || null,
      image_url: String(x.image_url ?? "").trim() || null,
      points_cost: Math.max(1, Number(x.points_cost || 0)),
      stock_remaining: Number(x.stock_remaining ?? -1),
      per_order_limit: Math.max(1, Number(x.per_order_limit || 1)),
      per_user_daily_limit: Math.max(0, Number(x.per_user_daily_limit || 0)),
      per_user_lifetime_limit: Math.max(0, Number(x.per_user_lifetime_limit || 0)),
      enabled: x.enabled !== false,
      sort_order: Number(x.sort_order || idx + 1),
      mall_category_id: uuidRe.test(rawCat) ? rawCat : null,
    };
  });

  const data = await apiPost<unknown>("/api/data/rpc/upsert_my_member_points_mall_items", {
    p_items: payload,
    ...(tenantId ? { p_tenant_id: tenantId } : {}),
  });
  const r = (data || {}) as { success?: boolean; error?: string };
  if (!r.success) throw new Error(r.error || "Save points mall items failed");
}

export async function listMemberPointsMallItems(memberId: string): Promise<PointsMallItem[]> {
  const data = await apiPost<unknown>("/api/data/rpc/member_list_points_mall_items", {
    p_member_id: memberId,
  });
  const r = (data || {}) as { success?: boolean; error?: string; items?: PointsMallItem[] };
  if (!r.success) throw new Error(r.error || "Load member mall items failed");
  return (r.items || []) as PointsMallItem[];
}

export async function listMemberPointsMallCategories(memberId: string): Promise<PointsMallCategory[]> {
  const data = await apiPost<unknown>("/api/data/rpc/member_list_points_mall_categories", {
    p_member_id: memberId,
  });
  const r = (data || {}) as { success?: boolean; error?: string; categories?: PointsMallCategory[] };
  if (!r.success) throw new Error(r.error || "Load mall categories failed");
  return (r.categories || []) as PointsMallCategory[];
}

export async function listMyPointsMallCategories(tenantId?: string | null): Promise<PointsMallCategory[]> {
  const data = await apiPost<unknown>("/api/data/rpc/list_my_member_points_mall_categories", {
    ...(tenantId ? { p_tenant_id: tenantId } : {}),
  });
  const r = (data || {}) as { success?: boolean; error?: string; categories?: PointsMallCategory[] };
  if (!r.success) throw new Error(r.error || "Load mall categories failed");
  return (r.categories || []) as PointsMallCategory[];
}

export async function saveMyPointsMallCategories(
  categories: { id?: string; name_zh: string; name_en?: string }[],
  tenantId?: string | null,
): Promise<void> {
  const data = await apiPost<unknown>("/api/data/rpc/save_my_member_points_mall_categories", {
    p_categories: categories,
    ...(tenantId ? { p_tenant_id: tenantId } : {}),
  });
  const r = (data || {}) as { success?: boolean; error?: string };
  if (!r.success) throw new Error(r.error || "Save mall categories failed");
}

/** 会员门户兑换记录（勿用 /api/data/table/*，会员 JWT 会 403） */
export type MemberPortalRedemptionRpcRow = {
  id: string;
  prize_name: string;
  quantity: number;
  status: string;
  created_at: string;
  points_used?: number;
};

export async function listMemberPointsMallRedemptionsForPortal(
  memberId: string,
  limit = 20,
): Promise<MemberPortalRedemptionRpcRow[]> {
  const data = await apiPost<unknown>("/api/data/rpc/member_list_points_mall_redemptions", {
    p_member_id: memberId,
    p_limit: limit,
  });
  const r = (data || {}) as { success?: boolean; error?: string; items?: MemberPortalRedemptionRpcRow[] };
  if (!r.success) throw new Error(r.error || "Load member redemptions failed");
  return (r.items || []) as MemberPortalRedemptionRpcRow[];
}

export type RedeemPointsMallItemResult = {
  success: boolean;
  error?: string;
  required?: number;
  current?: number;
  limit?: number;
  used?: number;
  /** 库存不足时：当前可兑件数 */
  available?: number;
  /** 库存不足时：本次请求件数 */
  requested?: number;
  quantity?: number;
  points_used?: number;
  item?: { id: string; title: string; image_url?: string | null };
  /** 服务端识别为同一 p_client_request_id 的重复提交 */
  idempotent_replay?: boolean;
  /** 系统异常等附带回传 */
  message?: string;
};

/** 解析 RPC 的 success 标记（兼容 1/0、嵌套 result/data 等中间层形态） */
function coerceRedeemSuccessFlag(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (v === 1) return true;
  if (v === 0) return false;
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

function unwrapRedeemRpcPayload(raw: unknown): Record<string, unknown> {
  let cur: unknown = raw;
  for (let depth = 0; depth < 3 && cur && typeof cur === "object"; depth++) {
    const o = cur as Record<string, unknown>;
    const ok = coerceRedeemSuccessFlag(o.success);
    if (ok !== null) return o;
    const inner =
      o.result && typeof o.result === "object"
        ? o.result
        : o.data && typeof o.data === "object" && o.data !== null && "success" in (o.data as object)
          ? o.data
          : null;
    if (!inner) break;
    cur = inner;
  }
  return (cur && typeof cur === "object" ? cur : {}) as Record<string, unknown>;
}

export async function redeemPointsMallItem(
  memberId: string,
  itemId: string,
  quantity: number,
  /** 8–64 位 [a-zA-Z0-9_-]，同一键重复请求返回首次兑换结果（需 DB 迁移 client_request_id） */
  clientRequestId?: string,
): Promise<RedeemPointsMallItemResult> {
  const data = await apiPost<unknown>("/api/data/rpc/member_redeem_points_mall_item", {
    p_member_id: memberId,
    p_item_id: itemId,
    p_quantity: quantity,
    ...(clientRequestId && /^[a-zA-Z0-9_-]{8,64}$/.test(clientRequestId)
      ? { p_client_request_id: clientRequestId }
      : {}),
  });
  const raw = unwrapRedeemRpcPayload(data);
  const ok = coerceRedeemSuccessFlag(raw.success);
  // 业务错误（积分不足、库存等）原样返回，由页面展示结构化提示；仅无法识别 success 时抛错
  if (ok !== null) {
    return { ...raw, success: ok } as RedeemPointsMallItemResult;
  }
  throw new Error(typeof raw.error === "string" ? raw.error : "Redeem failed");
}

export interface PointsMallRedemptionOrder {
  id: string;
  member_id: string;
  member_code: string | null;
  member_phone: string | null;
  item_title: string;
  item_image_url: string | null;
  quantity: number;
  points_used: number;
  status: string;
  created_at: string;
  processed_at?: string | null;
  process_note?: string | null;
  /** 完成/驳回该单的员工展示名（服务端 COALESCE 快照与 employees） */
  handler_name?: string | null;
}

/** 服务端/驱动偶发把手机号等以 number 返回，统一成 string | null 避免前端 .trim 崩溃 */
function normalizeNullableString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
}

function normalizePointsMallRedemptionOrder(row: PointsMallRedemptionOrder): PointsMallRedemptionOrder {
  return {
    ...row,
    member_phone: normalizeNullableString(row.member_phone),
    member_code: normalizeNullableString(row.member_code),
    handler_name: normalizeNullableString(row.handler_name),
    item_title: String(row.item_title ?? "").trim(),
    item_image_url: normalizeNullableString(row.item_image_url),
    quantity: Number(row.quantity) || 0,
    points_used: Number(row.points_used) || 0,
  };
}

export async function listMyPointsMallRedemptionOrders(
  status?: string,
  limit = 50,
  tenantId?: string | null,
): Promise<PointsMallRedemptionOrder[]> {
  const data = await apiPost<unknown>("/api/data/rpc/list_my_member_points_mall_redemptions", {
    p_status: status || null,
    p_limit: limit,
    ...(tenantId ? { p_tenant_id: tenantId } : {}),
  });
  const r = (data || {}) as { success?: boolean; error?: string; items?: PointsMallRedemptionOrder[] };
  if (!r.success) throw new Error(r.error || "Load redemption orders failed");
  const items = (r.items || []) as PointsMallRedemptionOrder[];
  return items.map(normalizePointsMallRedemptionOrder);
}

export async function processMyPointsMallRedemptionOrder(
  orderId: string,
  action: "complete" | "reject" | "cancel",
  note?: string,
): Promise<{ success: boolean; status: string }> {
  const data = await apiPost<unknown>("/api/data/rpc/process_my_member_points_mall_redemption", {
    p_redemption_id: orderId,
    p_action: action,
    p_note: note || null,
  });
  const r = (data || {}) as { success?: boolean; error?: string; status?: string };
  if (!r.success) throw new Error(r.error || "Process redemption order failed");
  return r as { success: boolean; status: string };
}
