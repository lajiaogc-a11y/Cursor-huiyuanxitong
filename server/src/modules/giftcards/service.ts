/**
 * Giftcards Service - 礼品卡/卡商/支付渠道业务逻辑
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
export async function listCardsService(status?: string) {
  return listCardsRepository(status);
}

export async function getCardByIdService(id: string) {
  return getCardByIdRepository(id);
}

export async function createCardService(body: CreateCardBody) {
  return createCardRepository(body);
}

export async function updateCardService(id: string, body: UpdateCardBody) {
  return updateCardRepository(id, body);
}

export async function deleteCardService(id: string) {
  return deleteCardRepository(id);
}

// Vendors
export async function listVendorsService(status?: string) {
  return listVendorsRepository(status);
}

export async function getVendorByIdService(id: string) {
  return getVendorByIdRepository(id);
}

export async function createVendorService(body: CreateVendorBody) {
  return createVendorRepository(body);
}

export async function updateVendorService(id: string, body: UpdateVendorBody, oldName?: string) {
  const data = await updateVendorRepository(id, body);
  if (body.name && oldName && body.name !== oldName) {
    await updateCardsVendorNameRepository(oldName, body.name);
    await updateLedgerAndBalanceForVendorRenameRepository(oldName, body.name);
  }
  return data;
}

export async function deleteVendorService(id: string, vendorName?: string) {
  if (vendorName) {
    await removeVendorFromCardsRepository(vendorName);
  }
  return deleteVendorRepository(id);
}

// Payment Providers
export async function listPaymentProvidersService(status?: string) {
  return listPaymentProvidersRepository(status);
}

export async function getPaymentProviderByIdService(id: string) {
  return getPaymentProviderByIdRepository(id);
}

export async function createPaymentProviderService(body: CreateProviderBody) {
  return createPaymentProviderRepository(body);
}

export async function updatePaymentProviderService(id: string, body: UpdateProviderBody, oldName?: string) {
  const data = await updatePaymentProviderRepository(id, body);
  if (body.name && oldName && body.name !== oldName) {
    await updateVendorsProviderNameRepository(oldName, body.name);
    await updateLedgerAndBalanceForProviderRenameRepository(oldName, body.name);
  }
  return data;
}

export async function deletePaymentProviderService(id: string, providerName?: string) {
  if (providerName) {
    await removeProviderFromVendorsRepository(providerName);
  }
  return deletePaymentProviderRepository(id);
}
