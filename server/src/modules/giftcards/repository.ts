/**
 * Giftcards Repository - 唯一可操作 cards, vendors, payment_providers 表的层
 */
import { randomUUID } from 'crypto';
import { query, queryOne, execute } from '../../database/index.js';
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
  if (status) {
    return await query(
      `SELECT * FROM cards WHERE status = ? ORDER BY sort_order ASC, name ASC`,
      [status]
    );
  }
  return await query(`SELECT * FROM cards ORDER BY sort_order ASC, name ASC`);
}

export async function getCardByIdRepository(id: string) {
  return await queryOne(`SELECT * FROM cards WHERE id = ?`, [id]);
}

export async function createCardRepository(body: CreateCardBody) {
  const id = randomUUID();
  const cardVendors = JSON.stringify(body.card_vendors ?? []);
  await execute(
    `INSERT INTO cards (id, name, type, status, remark, card_vendors) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, body.name, body.type ?? null, body.status ?? 'active', body.remark ?? null, cardVendors]
  );
  return await queryOne(`SELECT * FROM cards WHERE id = ?`, [id]);
}

export async function updateCardRepository(id: string, body: UpdateCardBody) {
  const fields: string[] = [];
  const values: any[] = [];
  if (body.name !== undefined) { fields.push('name = ?'); values.push(body.name); }
  if (body.type !== undefined) { fields.push('type = ?'); values.push(body.type); }
  if (body.status !== undefined) { fields.push('status = ?'); values.push(body.status); }
  if (body.remark !== undefined) { fields.push('remark = ?'); values.push(body.remark); }
  if (body.card_vendors !== undefined) { fields.push('card_vendors = ?'); values.push(JSON.stringify(body.card_vendors)); }
  if (body.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(body.sort_order); }
  if (fields.length === 0) return getCardByIdRepository(id);
  values.push(id);
  await execute(`UPDATE cards SET ${fields.join(', ')} WHERE id = ?`, values);
  return await queryOne(`SELECT * FROM cards WHERE id = ?`, [id]);
}

export async function deleteCardRepository(id: string) {
  await execute(`DELETE FROM cards WHERE id = ?`, [id]);
}

// ============= Vendors =============
export async function listVendorsRepository(status?: string) {
  if (status) {
    return await query(
      `SELECT * FROM vendors WHERE status = ? ORDER BY sort_order ASC, name ASC`,
      [status]
    );
  }
  return await query(`SELECT * FROM vendors ORDER BY sort_order ASC, name ASC`);
}

export async function getVendorByIdRepository(id: string) {
  return await queryOne(`SELECT * FROM vendors WHERE id = ?`, [id]);
}

export async function createVendorRepository(body: CreateVendorBody) {
  const id = randomUUID();
  const paymentProviders = JSON.stringify(body.payment_providers ?? []);
  await execute(
    `INSERT INTO vendors (id, name, status, remark, payment_providers) VALUES (?, ?, ?, ?, ?)`,
    [id, body.name, body.status ?? 'active', body.remark ?? null, paymentProviders]
  );
  return await queryOne(`SELECT * FROM vendors WHERE id = ?`, [id]);
}

export async function updateVendorRepository(id: string, body: UpdateVendorBody) {
  const fields: string[] = [];
  const values: any[] = [];
  if (body.name !== undefined) { fields.push('name = ?'); values.push(body.name); }
  if (body.status !== undefined) { fields.push('status = ?'); values.push(body.status); }
  if (body.remark !== undefined) { fields.push('remark = ?'); values.push(body.remark); }
  if (body.payment_providers !== undefined) { fields.push('payment_providers = ?'); values.push(JSON.stringify(body.payment_providers)); }
  if (body.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(body.sort_order); }
  if (fields.length === 0) return getVendorByIdRepository(id);
  values.push(id);
  await execute(`UPDATE vendors SET ${fields.join(', ')} WHERE id = ?`, values);
  return await queryOne(`SELECT * FROM vendors WHERE id = ?`, [id]);
}

export async function deleteVendorRepository(id: string) {
  try {
    await execute(`UPDATE gift_cards SET vendor_id = NULL WHERE vendor_id = ?`, [id]);
  } catch { /* gift_cards table may not have vendor_id */ }
  try {
    await execute(`UPDATE orders SET vendor_id = NULL WHERE vendor_id = ?`, [id]);
  } catch { /* orders table may not have vendor_id */ }
  await execute(`DELETE FROM vendors WHERE id = ?`, [id]);
}

export async function updateCardsVendorNameRepository(oldName: string, newName: string) {
  const cards = await query<{ id: string; card_vendors: string }>(
    `SELECT id, card_vendors FROM cards WHERE JSON_CONTAINS(card_vendors, JSON_QUOTE(?))`,
    [oldName]
  );
  if (!cards.length) return;
  for (const card of cards) {
    const vendors: string[] = typeof card.card_vendors === 'string' ? JSON.parse(card.card_vendors) : (card.card_vendors || []);
    const updated = vendors.map((v: string) => (v === oldName ? newName : v));
    await execute(`UPDATE cards SET card_vendors = ? WHERE id = ?`, [JSON.stringify(updated), card.id]);
  }
}

export async function removeVendorFromCardsRepository(vendorName: string) {
  try {
    const cards = await query<{ id: string; card_vendors: string }>(
      `SELECT id, card_vendors FROM cards WHERE card_vendors IS NOT NULL AND card_vendors != '[]' AND card_vendors != ''`,
    );
    if (!cards.length) return;
    for (const card of cards) {
      try {
        const vendors: string[] = typeof card.card_vendors === 'string' ? JSON.parse(card.card_vendors) : (card.card_vendors || []);
        if (!vendors.includes(vendorName)) continue;
        const updated = vendors.filter((v: string) => v !== vendorName);
        await execute(`UPDATE cards SET card_vendors = ? WHERE id = ?`, [JSON.stringify(updated), card.id]);
      } catch (_) { /* individual card vendor update is best-effort */ }
    }
  } catch (_) { /* vendor rename on cards table is best-effort; may fail if table not migrated */ }
}

export async function updateLedgerAndBalanceForVendorRenameRepository(oldName: string, newName: string) {
  await execute(
    `UPDATE ledger_transactions SET account_id = ? WHERE account_type = 'card_vendor' AND account_id = ?`,
    [newName, oldName]
  );
  await execute(
    `UPDATE balance_change_logs SET merchant_name = ? WHERE merchant_type = 'card_vendor' AND merchant_name = ?`,
    [newName, oldName]
  );
}

// ============= Payment Providers =============
export async function listPaymentProvidersRepository(status?: string) {
  if (status) {
    return await query(
      `SELECT * FROM payment_providers WHERE status = ? ORDER BY sort_order ASC, name ASC`,
      [status]
    );
  }
  return await query(`SELECT * FROM payment_providers ORDER BY sort_order ASC, name ASC`);
}

export async function getPaymentProviderByIdRepository(id: string) {
  return await queryOne(`SELECT * FROM payment_providers WHERE id = ?`, [id]);
}

export async function createPaymentProviderRepository(body: CreateProviderBody) {
  const id = randomUUID();
  await execute(
    `INSERT INTO payment_providers (id, name, status, remark) VALUES (?, ?, ?, ?)`,
    [id, body.name, body.status ?? 'active', body.remark ?? null]
  );
  return await queryOne(`SELECT * FROM payment_providers WHERE id = ?`, [id]);
}

export async function updatePaymentProviderRepository(id: string, body: UpdateProviderBody) {
  const fields: string[] = [];
  const values: any[] = [];
  if (body.name !== undefined) { fields.push('name = ?'); values.push(body.name); }
  if (body.status !== undefined) { fields.push('status = ?'); values.push(body.status); }
  if (body.remark !== undefined) { fields.push('remark = ?'); values.push(body.remark); }
  if (body.sort_order !== undefined) { fields.push('sort_order = ?'); values.push(body.sort_order); }
  if (fields.length === 0) return getPaymentProviderByIdRepository(id);
  values.push(id);
  await execute(`UPDATE payment_providers SET ${fields.join(', ')} WHERE id = ?`, values);
  return await queryOne(`SELECT * FROM payment_providers WHERE id = ?`, [id]);
}

export async function deletePaymentProviderRepository(id: string) {
  try {
    await execute(`UPDATE orders SET payment_provider = NULL WHERE payment_provider = (SELECT name FROM payment_providers WHERE id = ?)`, [id]);
  } catch { /* orders may not have payment_provider column */ }
  await execute(`DELETE FROM payment_providers WHERE id = ?`, [id]);
}

export async function updateVendorsProviderNameRepository(oldName: string, newName: string) {
  const vendors = await query<{ id: string; payment_providers: string }>(
    `SELECT id, payment_providers FROM vendors WHERE JSON_CONTAINS(payment_providers, JSON_QUOTE(?))`,
    [oldName]
  );
  if (!vendors.length) return;
  for (const vendor of vendors) {
    const providers: string[] = typeof vendor.payment_providers === 'string' ? JSON.parse(vendor.payment_providers) : (vendor.payment_providers || []);
    const updated = providers.map((p: string) => (p === oldName ? newName : p));
    await execute(`UPDATE vendors SET payment_providers = ? WHERE id = ?`, [JSON.stringify(updated), vendor.id]);
  }
}

export async function removeProviderFromVendorsRepository(providerName: string) {
  try {
    const vendors = await query<{ id: string; payment_providers: string }>(
      `SELECT id, payment_providers FROM vendors WHERE payment_providers IS NOT NULL AND payment_providers != '[]' AND payment_providers != ''`,
    );
    if (!vendors.length) return;
    for (const vendor of vendors) {
      try {
        const providers: string[] = typeof vendor.payment_providers === 'string' ? JSON.parse(vendor.payment_providers) : (vendor.payment_providers || []);
        if (!providers.includes(providerName)) continue;
        const updated = providers.filter((p: string) => p !== providerName);
        await execute(`UPDATE vendors SET payment_providers = ? WHERE id = ?`, [JSON.stringify(updated), vendor.id]);
      } catch { /* skip malformed JSON row */ }
    }
  } catch { /* vendors table may not exist or lack column */ }
}

export async function updateLedgerAndBalanceForProviderRenameRepository(oldName: string, newName: string) {
  await execute(
    `UPDATE ledger_transactions SET account_id = ? WHERE account_type = 'payment_provider' AND account_id = ?`,
    [newName, oldName]
  );
  await execute(
    `UPDATE activity_gifts SET payment_agent = ? WHERE payment_agent = ?`,
    [newName, oldName]
  );
  await execute(
    `UPDATE balance_change_logs SET merchant_name = ? WHERE merchant_type = 'payment_provider' AND merchant_name = ?`,
    [newName, oldName]
  );
}

// Legacy - for backward compatibility
export async function listGiftCardsRepository(_tenantId: string) {
  return listCardsRepository('active');
}
