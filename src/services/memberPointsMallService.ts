import { supabase } from "@/integrations/supabase/client";

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
  enabled?: boolean;
  sort_order?: number;
}

export async function listMyPointsMallItems(): Promise<PointsMallItem[]> {
  const { data, error } = await (supabase.rpc as any)("list_my_member_points_mall_items");
  if (error) throw new Error(error.message || "Load points mall items failed");
  const r = (data || {}) as any;
  if (!r.success) throw new Error(r.error || "Load points mall items failed");
  return (r.items || []) as PointsMallItem[];
}

export async function upsertMyPointsMallItems(items: Omit<PointsMallItem, "id">[] | PointsMallItem[]): Promise<void> {
  const payload = items.map((x, idx) => ({
    title: String(x.title || "").trim(),
    description: x.description ?? null,
    image_url: x.image_url ?? null,
    points_cost: Number(x.points_cost || 0),
    stock_remaining: Number(x.stock_remaining ?? -1),
    per_order_limit: Number(x.per_order_limit || 1),
    per_user_daily_limit: Number(x.per_user_daily_limit || 0),
    per_user_lifetime_limit: Number(x.per_user_lifetime_limit || 0),
    enabled: x.enabled !== false,
    sort_order: Number(x.sort_order || idx + 1),
  }));

  const { data, error } = await (supabase.rpc as any)("upsert_my_member_points_mall_items", {
    p_items: payload,
  });
  if (error) throw new Error(error.message || "Save points mall items failed");
  const r = (data || {}) as any;
  if (!r.success) throw new Error(r.error || "Save points mall items failed");
}

export async function listMemberPointsMallItems(memberId: string): Promise<PointsMallItem[]> {
  const { data, error } = await (supabase.rpc as any)("member_list_points_mall_items", {
    p_member_id: memberId,
  });
  if (error) throw new Error(error.message || "Load member mall items failed");
  const r = (data || {}) as any;
  if (!r.success) throw new Error(r.error || "Load member mall items failed");
  return (r.items || []) as PointsMallItem[];
}

export async function redeemPointsMallItem(memberId: string, itemId: string, quantity: number) {
  const { data, error } = await (supabase.rpc as any)("member_redeem_points_mall_item", {
    p_member_id: memberId,
    p_item_id: itemId,
    p_quantity: quantity,
  });
  if (error) throw new Error(error.message || "Redeem failed");
  return (data || {}) as {
    success: boolean;
    error?: string;
    required?: number;
    current?: number;
    limit?: number;
    used?: number;
    quantity?: number;
    points_used?: number;
    item?: { id: string; title: string; image_url?: string | null };
  };
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
}

export async function listMyPointsMallRedemptionOrders(status?: string, limit = 50): Promise<PointsMallRedemptionOrder[]> {
  const { data, error } = await (supabase.rpc as any)("list_my_member_points_mall_redemptions", {
    p_status: status || null,
    p_limit: limit,
  });
  if (error) throw new Error(error.message || "Load redemption orders failed");
  const r = (data || {}) as any;
  if (!r.success) throw new Error(r.error || "Load redemption orders failed");
  return (r.items || []) as PointsMallRedemptionOrder[];
}

export async function processMyPointsMallRedemptionOrder(orderId: string, action: "complete" | "reject", note?: string) {
  const { data, error } = await (supabase.rpc as any)("process_my_member_points_mall_redemption", {
    p_redemption_id: orderId,
    p_action: action,
    p_note: note || null,
  });
  if (error) throw new Error(error.message || "Process redemption order failed");
  const r = (data || {}) as any;
  if (!r.success) throw new Error(r.error || "Process redemption order failed");
  return r as { success: boolean; status: string };
}
