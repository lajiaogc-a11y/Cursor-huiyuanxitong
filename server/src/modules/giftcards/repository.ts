/**
 * Giftcards Repository - 唯一可操作 cards, vendors, payment_providers 表的层
 */
import { supabaseAdmin } from '../../database/index.js';
import type {
  CreateCardBody,
  UpdateCardBody,
  CreateVendorBody,
  UpdateVendorBody,
  CreateProviderBody,
  UpdateProviderBody,
} from './types.js';

// ============= Cards =============
export async function listCardsRepository(status?: string) {
  let q = supabaseAdmin.from('cards').select('*').order('sort_order', { ascending: true, nullsFirst: false }).order('name', { ascending: true });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getCardByIdRepository(id: string) {
  const { data, error } = await supabaseAdmin.from('cards').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function createCardRepository(body: CreateCardBody) {
  const { data, error } = await supabaseAdmin
    .from('cards')
    .insert({
      name: body.name,
      type: body.type ?? null,
      status: body.status ?? 'active',
      remark: body.remark ?? null,
      card_vendors: body.card_vendors ?? [],
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCardRepository(id: string, body: UpdateCardBody) {
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.type !== undefined) updates.type = body.type;
  if (body.status !== undefined) updates.status = body.status;
  if (body.remark !== undefined) updates.remark = body.remark;
  if (body.card_vendors !== undefined) updates.card_vendors = body.card_vendors;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;
  if (Object.keys(updates).length === 0) return getCardByIdRepository(id);
  const { data, error } = await supabaseAdmin.from('cards').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCardRepository(id: string) {
  const { error } = await supabaseAdmin.from('cards').delete().eq('id', id);
  if (error) throw error;
}

// ============= Vendors =============
export async function listVendorsRepository(status?: string) {
  let q = supabaseAdmin.from('vendors').select('*').order('sort_order', { ascending: true, nullsFirst: false }).order('name', { ascending: true });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getVendorByIdRepository(id: string) {
  const { data, error } = await supabaseAdmin.from('vendors').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function createVendorRepository(body: CreateVendorBody) {
  const { data, error } = await supabaseAdmin
    .from('vendors')
    .insert({
      name: body.name,
      status: body.status ?? 'active',
      remark: body.remark ?? null,
      payment_providers: body.payment_providers ?? [],
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateVendorRepository(id: string, body: UpdateVendorBody) {
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.status !== undefined) updates.status = body.status;
  if (body.remark !== undefined) updates.remark = body.remark;
  if (body.payment_providers !== undefined) updates.payment_providers = body.payment_providers;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;
  if (Object.keys(updates).length === 0) return getVendorByIdRepository(id);
  const { data, error } = await supabaseAdmin.from('vendors').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteVendorRepository(id: string) {
  const { error } = await supabaseAdmin.from('vendors').delete().eq('id', id);
  if (error) throw error;
}

export async function updateCardsVendorNameRepository(oldName: string, newName: string) {
  const { data: cards } = await supabaseAdmin.from('cards').select('id, card_vendors').contains('card_vendors', [oldName]);
  if (!cards?.length) return;
  for (const card of cards) {
    const updated = (card.card_vendors || []).map((v: string) => (v === oldName ? newName : v));
    await supabaseAdmin.from('cards').update({ card_vendors: updated }).eq('id', card.id);
  }
}

export async function removeVendorFromCardsRepository(vendorName: string) {
  const { data: cards } = await supabaseAdmin.from('cards').select('id, card_vendors').contains('card_vendors', [vendorName]);
  if (!cards?.length) return;
  for (const card of cards) {
    const updated = (card.card_vendors || []).filter((v: string) => v !== vendorName);
    await supabaseAdmin.from('cards').update({ card_vendors: updated }).eq('id', card.id);
  }
}

export async function updateLedgerAndBalanceForVendorRenameRepository(oldName: string, newName: string) {
  await supabaseAdmin.from('ledger_transactions').update({ account_id: newName }).eq('account_type', 'card_vendor').eq('account_id', oldName);
  await supabaseAdmin.from('balance_change_logs').update({ merchant_name: newName }).eq('merchant_type', 'card_vendor').eq('merchant_name', oldName);
}

// ============= Payment Providers =============
export async function listPaymentProvidersRepository(status?: string) {
  let q = supabaseAdmin.from('payment_providers').select('*').order('sort_order', { ascending: true, nullsFirst: false }).order('name', { ascending: true });
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
}

export async function getPaymentProviderByIdRepository(id: string) {
  const { data, error } = await supabaseAdmin.from('payment_providers').select('*').eq('id', id).single();
  if (error) throw error;
  return data;
}

export async function createPaymentProviderRepository(body: CreateProviderBody) {
  const { data, error } = await supabaseAdmin
    .from('payment_providers')
    .insert({
      name: body.name,
      status: body.status ?? 'active',
      remark: body.remark ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updatePaymentProviderRepository(id: string, body: UpdateProviderBody) {
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.status !== undefined) updates.status = body.status;
  if (body.remark !== undefined) updates.remark = body.remark;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;
  if (Object.keys(updates).length === 0) return getPaymentProviderByIdRepository(id);
  const { data, error } = await supabaseAdmin.from('payment_providers').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deletePaymentProviderRepository(id: string) {
  const { error } = await supabaseAdmin.from('payment_providers').delete().eq('id', id);
  if (error) throw error;
}

export async function updateVendorsProviderNameRepository(oldName: string, newName: string) {
  const { data: vendors } = await supabaseAdmin.from('vendors').select('id, payment_providers').contains('payment_providers', [oldName]);
  if (!vendors?.length) return;
  for (const vendor of vendors) {
    const updated = (vendor.payment_providers || []).map((p: string) => (p === oldName ? newName : p));
    await supabaseAdmin.from('vendors').update({ payment_providers: updated }).eq('id', vendor.id);
  }
}

export async function removeProviderFromVendorsRepository(providerName: string) {
  const { data: vendors } = await supabaseAdmin.from('vendors').select('id, payment_providers').contains('payment_providers', [providerName]);
  if (!vendors?.length) return;
  for (const vendor of vendors) {
    const updated = (vendor.payment_providers || []).filter((p: string) => p !== providerName);
    await supabaseAdmin.from('vendors').update({ payment_providers: updated }).eq('id', vendor.id);
  }
}

export async function updateLedgerAndBalanceForProviderRenameRepository(oldName: string, newName: string) {
  await supabaseAdmin.from('ledger_transactions').update({ account_id: newName }).eq('account_type', 'payment_provider').eq('account_id', oldName);
  await supabaseAdmin.from('activity_gifts').update({ payment_agent: newName }).eq('payment_agent', oldName);
  await supabaseAdmin.from('balance_change_logs').update({ merchant_name: newName }).eq('merchant_type', 'payment_provider').eq('merchant_name', oldName);
}

// Legacy - for backward compatibility
export async function listGiftCardsRepository(_tenantId: string) {
  return listCardsRepository('active');
}
