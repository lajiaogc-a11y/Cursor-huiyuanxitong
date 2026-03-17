import { supabase } from '@/integrations/supabase/client';

export type OrderInsertPayload = Record<string, unknown>;

export async function insertOrderRecord(payload: OrderInsertPayload) {
  const { data, error } = await supabase
    .from('orders')
    .insert(payload)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function updateOrderRecord(orderId: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', orderId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function patchOrderRecord(orderId: string, updates: Record<string, unknown>) {
  const { error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', orderId);
  if (error) throw error;
}

export async function getOrderDeleteState(orderId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select('is_deleted')
    .eq('id', orderId)
    .single();
  if (error) throw error;
  return data;
}

