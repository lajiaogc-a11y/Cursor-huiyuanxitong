/**
 * Giftcards Service - 礼品卡/卡商/支付渠道业务逻辑（按租户）
 */
import {
  listCardsRepository,
  getCardByIdRepository,
  createCardRepository,
  updateCardRepository,
  deleteCardRepository,
  listVendorsRepository,
  getVendorByIdRepository,
  createVendorRepository,
  updateVendorRepository,
  deleteVendorRepository,
  updateCardsVendorNameRepository,
  removeVendorFromCardsRepository,
  updateLedgerAndBalanceForVendorRenameRepository,
  listPaymentProvidersRepository,
  getPaymentProviderByIdRepository,
  createPaymentProviderRepository,
  updatePaymentProviderRepository,
  deletePaymentProviderRepository,
  updateVendorsProviderNameRepository,
  removeProviderFromVendorsRepository,
  updateLedgerAndBalanceForProviderRenameRepository,
  listGiftCardsRepository,
} from './repository.js';
import type {
  CreateCardBody,
  UpdateCardBody,
  CreateVendorBody,
  UpdateVendorBody,
  CreateProviderBody,
  UpdateProviderBody,
} from './types.js';

export async function listGiftCardsService(tenantId: string) {
  return listGiftCardsRepository(tenantId);
}

// Cards
export async function listCardsService(tenantId: string, status?: string) {
  return listCardsRepository(tenantId, status);
}

export async function getCardByIdService(tenantId: string, id: string) {
  return getCardByIdRepository(tenantId, id);
}

export async function createCardService(tenantId: string, body: CreateCardBody) {
  return createCardRepository(tenantId, body);
}

export async function updateCardService(tenantId: string, id: string, body: UpdateCardBody) {
  return updateCardRepository(tenantId, id, body);
}

export async function deleteCardService(tenantId: string, id: string) {
  return deleteCardRepository(tenantId, id);
}

// Vendors
export async function listVendorsService(tenantId: string, status?: string) {
  return listVendorsRepository(tenantId, status);
}

export async function getVendorByIdService(tenantId: string, id: string) {
  return getVendorByIdRepository(tenantId, id);
}

export async function createVendorService(tenantId: string, body: CreateVendorBody) {
  return createVendorRepository(tenantId, body);
}

export async function updateVendorService(
  tenantId: string,
  id: string,
  body: UpdateVendorBody,
  oldName?: string,
) {
  const data = await updateVendorRepository(tenantId, id, body);
  if (body.name && oldName && body.name !== oldName) {
    await updateCardsVendorNameRepository(tenantId, oldName, body.name);
    await updateLedgerAndBalanceForVendorRenameRepository(tenantId, oldName, body.name);
  }
  return data;
}

export async function deleteVendorService(tenantId: string, id: string, vendorName?: string) {
  if (vendorName) {
    await removeVendorFromCardsRepository(tenantId, vendorName);
  }
  return deleteVendorRepository(tenantId, id);
}

// Payment Providers
export async function listPaymentProvidersService(tenantId: string, status?: string) {
  return listPaymentProvidersRepository(tenantId, status);
}

export async function getPaymentProviderByIdService(tenantId: string, id: string) {
  return getPaymentProviderByIdRepository(tenantId, id);
}

export async function createPaymentProviderService(tenantId: string, body: CreateProviderBody) {
  return createPaymentProviderRepository(tenantId, body);
}

export async function updatePaymentProviderService(
  tenantId: string,
  id: string,
  body: UpdateProviderBody,
  oldName?: string,
) {
  const data = await updatePaymentProviderRepository(tenantId, id, body);
  if (body.name && oldName && body.name !== oldName) {
    await updateVendorsProviderNameRepository(tenantId, oldName, body.name);
    await updateLedgerAndBalanceForProviderRenameRepository(tenantId, oldName, body.name);
  }
  return data;
}

export async function deletePaymentProviderService(tenantId: string, id: string, providerName?: string) {
  if (providerName) {
    await removeProviderFromVendorsRepository(tenantId, providerName);
  }
  return deletePaymentProviderRepository(tenantId, id);
}
