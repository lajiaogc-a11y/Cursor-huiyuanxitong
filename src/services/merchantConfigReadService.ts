import { supabase } from "@/integrations/supabase/client";

export interface MerchantCardRecord {
  id: string;
  name: string;
  type: string;
  status: "active" | "inactive";
  remark: string;
  createdAt: string;
  cardVendors: string[];
  sortOrder: number;
}

export interface MerchantVendorRecord {
  id: string;
  name: string;
  status: "active" | "inactive";
  remark: string;
  createdAt: string;
  paymentProviders: string[];
  sortOrder: number;
}

export interface MerchantPaymentProviderRecord {
  id: string;
  name: string;
  status: "active" | "inactive";
  remark: string;
  createdAt: string;
  sortOrder: number;
}

function toDateOnly(value: string | null | undefined): string {
  if (!value) return "";
  return value.split("T")[0] || "";
}

export async function fetchMerchantCards(): Promise<MerchantCardRecord[]> {
  const { data, error } = await supabase
    .from("cards")
    .select("*")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []).map((c) => ({
    id: c.id,
    name: c.name,
    type: c.type || "",
    status: c.status as "active" | "inactive",
    remark: c.remark || "",
    createdAt: toDateOnly(c.created_at),
    cardVendors: c.card_vendors || [],
    sortOrder: c.sort_order || 0,
  }));
}

export async function fetchMerchantVendors(): Promise<MerchantVendorRecord[]> {
  const { data, error } = await supabase
    .from("vendors")
    .select("*")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []).map((v) => ({
    id: v.id,
    name: v.name,
    status: v.status as "active" | "inactive",
    remark: v.remark || "",
    createdAt: toDateOnly(v.created_at),
    paymentProviders: v.payment_providers || [],
    sortOrder: v.sort_order || 0,
  }));
}

export async function fetchMerchantPaymentProviders(): Promise<MerchantPaymentProviderRecord[]> {
  const { data, error } = await supabase
    .from("payment_providers")
    .select("*")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data || []).map((p) => ({
    id: p.id,
    name: p.name,
    status: p.status as "active" | "inactive",
    remark: p.remark || "",
    createdAt: toDateOnly(p.created_at),
    sortOrder: p.sort_order || 0,
  }));
}

export async function fetchMerchantConfigSnapshot() {
  const [cards, vendors, providers] = await Promise.all([
    fetchMerchantCards(),
    fetchMerchantVendors(),
    fetchMerchantPaymentProviders(),
  ]);
  return { cards, vendors, providers };
}

