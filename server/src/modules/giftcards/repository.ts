/**
 * Giftcards Repository - 唯一可操作 cards, vendors, payment_providers 表的层（按 tenant_id 隔离）
 */
import { randomUUID } from 'crypto';
import { query, queryOne, execute } from '../../database/index.js';
import { config } from '../../config/index.js';
import type {
  CreateCardBody,
  UpdateCardBody,
  CreateVendorBody,
  UpdateVendorBody,
  CreateProviderBody,
  UpdateProviderBody,
} from './types.js';

// ============= Cards =============
export async function listCardsRepository(tenantId: string, status?: string) {
  if (status) {
    return await query(
      `SELECT * FROM cards WHERE tenant_id = ? AND status = ? ORDER BY sort_order ASC, name ASC`,
      [tenantId, status],
    );
  }
  return await query(
    `SELECT * FROM cards WHERE tenant_id = ? ORDER BY sort_order ASC, name ASC`,
    [tenantId],
  );
}

export async function getCardByIdRepository(tenantId: string, id: string) {
  return await queryOne(`SELECT * FROM cards WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
}

export async function createCardRepository(tenantId: string, body: CreateCardBody) {
  const id = randomUUID();
  const cardVendors = JSON.stringify(body.card_vendors ?? []);
  await execute(
    `INSERT INTO cards (id, name, type, status, remark, card_vendors, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, body.name, body.type ?? null, body.status ?? 'active', body.remark ?? null, cardVendors, tenantId],
  );
  return await queryOne(`SELECT * FROM cards WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
}

export async function updateCardRepository(tenantId: string, id: string, body: UpdateCardBody) {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (body.name !== undefined) {
    fields.push('name = ?');
    values.push(body.name);
  }
  if (body.type !== undefined) {
    fields.push('type = ?');
    values.push(body.type);
  }
  if (body.status !== undefined) {
    fields.push('status = ?');
    values.push(body.status);
  }
  if (body.remark !== undefined) {
    fields.push('remark = ?');
    values.push(body.remark);
  }
  if (body.card_vendors !== undefined) {
    fields.push('card_vendors = ?');
    values.push(JSON.stringify(body.card_vendors));
  }
  if (body.sort_order !== undefined) {
    fields.push('sort_order = ?');
    values.push(body.sort_order);
  }
  if (fields.length === 0) return getCardByIdRepository(tenantId, id);
  values.push(id, tenantId);
  await execute(`UPDATE cards SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, values);
  return await queryOne(`SELECT * FROM cards WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
}

export async function deleteCardRepository(tenantId: string, id: string) {
  await execute(`DELETE FROM cards WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
}

// ============= Vendors =============
export async function listVendorsRepository(tenantId: string, status?: string) {
  if (status) {
    return await query(
      `SELECT * FROM vendors WHERE tenant_id = ? AND status = ? ORDER BY sort_order ASC, name ASC`,
      [tenantId, status],
    );
  }
  return await query(
    `SELECT * FROM vendors WHERE tenant_id = ? ORDER BY sort_order ASC, name ASC`,
    [tenantId],
  );
}

export async function getVendorByIdRepository(tenantId: string, id: string) {
  return await queryOne(`SELECT * FROM vendors WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
}

export async function createVendorRepository(tenantId: string, body: CreateVendorBody) {
  const id = randomUUID();
  const paymentProviders = JSON.stringify(body.payment_providers ?? []);
  await execute(
    `INSERT INTO vendors (id, name, status, remark, payment_providers, tenant_id) VALUES (?, ?, ?, ?, ?, ?)`,
    [id, body.name, body.status ?? 'active', body.remark ?? null, paymentProviders, tenantId],
  );
  return await queryOne(`SELECT * FROM vendors WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
}

export async function updateVendorRepository(tenantId: string, id: string, body: UpdateVendorBody) {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (body.name !== undefined) {
    fields.push('name = ?');
    values.push(body.name);
  }
  if (body.status !== undefined) {
    fields.push('status = ?');
    values.push(body.status);
  }
  if (body.remark !== undefined) {
    fields.push('remark = ?');
    values.push(body.remark);
  }
  if (body.payment_providers !== undefined) {
    fields.push('payment_providers = ?');
    values.push(JSON.stringify(body.payment_providers));
  }
  if (body.sort_order !== undefined) {
    fields.push('sort_order = ?');
    values.push(body.sort_order);
  }
  if (fields.length === 0) return getVendorByIdRepository(tenantId, id);
  values.push(id, tenantId);
  await execute(`UPDATE vendors SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, values);
  return await queryOne(`SELECT * FROM vendors WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
}

export async function deleteVendorRepository(tenantId: string, id: string) {
  try {
    await execute(`UPDATE gift_cards SET vendor_id = NULL WHERE vendor_id = ?`, [id]);
  } catch {
    /* gift_cards table may not have vendor_id */
  }
  try {
    await execute(`UPDATE orders SET vendor_id = NULL WHERE vendor_id = ?`, [id]);
  } catch {
    /* orders table may not have vendor_id */
  }
  await execute(`DELETE FROM vendors WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
}

export async function updateCardsVendorNameRepository(tenantId: string, oldName: string, newName: string) {
  const cards = await query<{ id: string; card_vendors: string }>(
    `SELECT id, card_vendors FROM cards WHERE tenant_id = ? AND JSON_CONTAINS(card_vendors, JSON_QUOTE(?))`,
    [tenantId, oldName],
  );
  if (!cards.length) return;
  for (const card of cards) {
    const vendors: string[] =
      typeof card.card_vendors === 'string' ? JSON.parse(card.card_vendors) : card.card_vendors || [];
    const updated = vendors.map((v: string) => (v === oldName ? newName : v));
    await execute(`UPDATE cards SET card_vendors = ? WHERE id = ? AND tenant_id = ?`, [
      JSON.stringify(updated),
      card.id,
      tenantId,
    ]);
  }
}

export async function removeVendorFromCardsRepository(tenantId: string, vendorName: string) {
  try {
    const cards = await query<{ id: string; card_vendors: string }>(
      `SELECT id, card_vendors FROM cards WHERE tenant_id = ? AND card_vendors IS NOT NULL AND card_vendors != '[]' AND card_vendors != ''`,
      [tenantId],
    );
    if (!cards.length) return;
    for (const card of cards) {
      try {
        const vendors: string[] =
          typeof card.card_vendors === 'string' ? JSON.parse(card.card_vendors) : card.card_vendors || [];
        if (!vendors.includes(vendorName)) continue;
        const updated = vendors.filter((v: string) => v !== vendorName);
        await execute(`UPDATE cards SET card_vendors = ? WHERE id = ? AND tenant_id = ?`, [
          JSON.stringify(updated),
          card.id,
          tenantId,
        ]);
      } catch {
        /* individual card vendor update is best-effort */
      }
    }
  } catch {
    /* may fail if table not migrated */
  }
}

/** 卡商重命名：账本按租户收敛；tenant_id 为空的历史行仅在「当前操作租户为平台租户」时一并改名，避免误改子租户同名卡商流水 */
export async function updateLedgerAndBalanceForVendorRenameRepository(
  tenantId: string,
  oldName: string,
  newName: string,
) {
  await execute(
    `UPDATE ledger_transactions SET account_id = ? WHERE account_type = 'card_vendor' AND account_id = ? AND (tenant_id = ? OR (tenant_id IS NULL AND ? = ?))`,
    [newName, oldName, tenantId, tenantId, config.platformTenantId],
  );
  await execute(
    `UPDATE balance_change_logs SET merchant_name = ? WHERE merchant_type = 'card_vendor' AND merchant_name = ?`,
    [newName, oldName],
  );
}

// ============= Payment Providers =============
export async function listPaymentProvidersRepository(tenantId: string, status?: string) {
  if (status) {
    return await query(
      `SELECT * FROM payment_providers WHERE tenant_id = ? AND status = ? ORDER BY sort_order ASC, name ASC`,
      [tenantId, status],
    );
  }
  return await query(
    `SELECT * FROM payment_providers WHERE tenant_id = ? ORDER BY sort_order ASC, name ASC`,
    [tenantId],
  );
}

export async function getPaymentProviderByIdRepository(tenantId: string, id: string) {
  return await queryOne(`SELECT * FROM payment_providers WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
}

export async function createPaymentProviderRepository(tenantId: string, body: CreateProviderBody) {
  const id = randomUUID();
  await execute(
    `INSERT INTO payment_providers (id, name, status, remark, tenant_id) VALUES (?, ?, ?, ?, ?)`,
    [id, body.name, body.status ?? 'active', body.remark ?? null, tenantId],
  );
  return await queryOne(`SELECT * FROM payment_providers WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
}

export async function updatePaymentProviderRepository(tenantId: string, id: string, body: UpdateProviderBody) {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (body.name !== undefined) {
    fields.push('name = ?');
    values.push(body.name);
  }
  if (body.status !== undefined) {
    fields.push('status = ?');
    values.push(body.status);
  }
  if (body.remark !== undefined) {
    fields.push('remark = ?');
    values.push(body.remark);
  }
  if (body.sort_order !== undefined) {
    fields.push('sort_order = ?');
    values.push(body.sort_order);
  }
  if (fields.length === 0) return getPaymentProviderByIdRepository(tenantId, id);
  values.push(id, tenantId);
  await execute(`UPDATE payment_providers SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`, values);
  return await queryOne(`SELECT * FROM payment_providers WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
}

export async function deletePaymentProviderRepository(tenantId: string, id: string) {
  try {
    await execute(
      `UPDATE orders SET payment_provider = NULL WHERE payment_provider = (SELECT name FROM payment_providers WHERE id = ? AND tenant_id = ?)`,
      [id, tenantId],
    );
  } catch {
    /* orders may not have payment_provider column */
  }
  await execute(`DELETE FROM payment_providers WHERE id = ? AND tenant_id = ?`, [id, tenantId]);
}

export async function updateVendorsProviderNameRepository(
  tenantId: string,
  oldName: string,
  newName: string,
) {
  const vendors = await query<{ id: string; payment_providers: string }>(
    `SELECT id, payment_providers FROM vendors WHERE tenant_id = ? AND JSON_CONTAINS(payment_providers, JSON_QUOTE(?))`,
    [tenantId, oldName],
  );
  if (!vendors.length) return;
  for (const vendor of vendors) {
    const providers: string[] =
      typeof vendor.payment_providers === 'string'
        ? JSON.parse(vendor.payment_providers)
        : vendor.payment_providers || [];
    const updated = providers.map((p: string) => (p === oldName ? newName : p));
    await execute(`UPDATE vendors SET payment_providers = ? WHERE id = ? AND tenant_id = ?`, [
      JSON.stringify(updated),
      vendor.id,
      tenantId,
    ]);
  }
}

export async function removeProviderFromVendorsRepository(tenantId: string, providerName: string) {
  try {
    const vendors = await query<{ id: string; payment_providers: string }>(
      `SELECT id, payment_providers FROM vendors WHERE tenant_id = ? AND payment_providers IS NOT NULL AND payment_providers != '[]' AND payment_providers != ''`,
      [tenantId],
    );
    if (!vendors.length) return;
    for (const vendor of vendors) {
      try {
        const providers: string[] =
          typeof vendor.payment_providers === 'string'
            ? JSON.parse(vendor.payment_providers)
            : vendor.payment_providers || [];
        if (!providers.includes(providerName)) continue;
        const updated = providers.filter((p: string) => p !== providerName);
        await execute(`UPDATE vendors SET payment_providers = ? WHERE id = ? AND tenant_id = ?`, [
          JSON.stringify(updated),
          vendor.id,
          tenantId,
        ]);
      } catch {
        /* skip malformed JSON row */
      }
    }
  } catch {
    /* vendors table may not exist or lack column */
  }
}

export async function updateLedgerAndBalanceForProviderRenameRepository(
  tenantId: string,
  oldName: string,
  newName: string,
) {
  await execute(
    `UPDATE ledger_transactions SET account_id = ? WHERE account_type = 'payment_provider' AND account_id = ? AND (tenant_id = ? OR (tenant_id IS NULL AND ? = ?))`,
    [newName, oldName, tenantId, tenantId, config.platformTenantId],
  );
  await execute(
    `UPDATE activity_gifts SET payment_agent = ? WHERE payment_agent = ? AND (tenant_id = ? OR (tenant_id IS NULL AND ? = ?))`,
    [newName, oldName, tenantId, tenantId, config.platformTenantId],
  );
  await execute(
    `UPDATE balance_change_logs SET merchant_name = ? WHERE merchant_type = 'payment_provider' AND merchant_name = ?`,
    [newName, oldName],
  );
}

export async function listGiftCardsRepository(tenantId: string) {
  return listCardsRepository(tenantId, 'active');
}
