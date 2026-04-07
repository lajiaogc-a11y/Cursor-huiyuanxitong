/**
 * Giftcards Controller — tenant_id 来自 query（或 POST body.tenant_id），与 shared_data 代管一致
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { resolveTenantId } from '../data/dataControllerShared.js';
import {
  listGiftCardsService,
  listCardsService,
  getCardByIdService,
  createCardService,
  updateCardService,
  deleteCardService,
  listVendorsService,
  getVendorByIdService,
  createVendorService,
  updateVendorService,
  deleteVendorService,
  listPaymentProvidersService,
  getPaymentProviderByIdService,
  createPaymentProviderService,
  updatePaymentProviderService,
  deletePaymentProviderService,
} from './service.js';

/** 平台超管可传 query/body.tenant_id 代管；普通员工仅 JWT 租户 */
function giftcardsTenantId(req: AuthenticatedRequest): string | null {
  const fromQuery = req.query.tenant_id as string | undefined;
  const body = req.body as { tenant_id?: string } | undefined;
  const fromBody = body?.tenant_id;
  const requested = fromQuery ?? fromBody;
  const tid = resolveTenantId(req, requested);
  return tid ?? null;
}

export async function listGiftCardsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = giftcardsTenantId(req);
  if (!tenantId) {
    res.json({ success: true, data: [] });
    return;
  }
  const data = await listGiftCardsService(tenantId);
  res.json({ success: true, data });
}

// Cards
export async function listCardsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = giftcardsTenantId(req);
  if (!tenantId) {
    res.json({ success: true, data: [] });
    return;
  }
  const status = req.query.status as string | undefined;
  const data = await listCardsService(tenantId, status);
  res.json({ success: true, data });
}

export async function getCardByIdController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = giftcardsTenantId(req);
  if (!tenantId) {
    res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'tenant_id required' } });
    return;
  }
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  try {
    const data = await getCardByIdService(tenantId, id);
    res.json({ success: true, data });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'PGRST116') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Card not found' } });
      return;
    }
    throw e;
  }
}

export async function createCardController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = giftcardsTenantId(req);
  if (!tenantId) {
    res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'tenant_id required' } });
    return;
  }
  const body = req.body;
  if (!body?.name) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name required' } });
    return;
  }
  try {
    const data = await createCardService(tenantId, body);
    res.status(201).json({ success: true, data });
  } catch (e: unknown) {
    const err = e as { message?: string };
    console.error('[Giftcards] createCard error:', e);
    res.status(500).json({
      success: false,
      error: { code: 'CREATE_FAILED', message: err?.message || 'Failed to create card' },
    });
  }
}

export async function updateCardController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = giftcardsTenantId(req);
  if (!tenantId) {
    res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'tenant_id required' } });
    return;
  }
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  try {
    const data = await updateCardService(tenantId, id, req.body);
    res.json({ success: true, data });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'PGRST116') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Card not found' } });
      return;
    }
    throw e;
  }
}

export async function deleteCardController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = giftcardsTenantId(req);
  if (!tenantId) {
    res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'tenant_id required' } });
    return;
  }
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  try {
    await deleteCardService(tenantId, id);
    res.json({ success: true });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'PGRST116') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Card not found' } });
      return;
    }
    throw e;
  }
}

// Vendors
export async function listVendorsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = giftcardsTenantId(req);
  if (!tenantId) {
    res.json({ success: true, data: [] });
    return;
  }
  const status = req.query.status as string | undefined;
  const data = await listVendorsService(tenantId, status);
  res.json({ success: true, data });
}

export async function getVendorByIdController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = giftcardsTenantId(req);
  if (!tenantId) {
    res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'tenant_id required' } });
    return;
  }
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  try {
    const data = await getVendorByIdService(tenantId, id);
    res.json({ success: true, data });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'PGRST116') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vendor not found' } });
      return;
    }
    throw e;
  }
}

export async function createVendorController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = giftcardsTenantId(req);
  if (!tenantId) {
    res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'tenant_id required' } });
    return;
  }
  const body = req.body;
  if (!body?.name) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name required' } });
    return;
  }
  const data = await createVendorService(tenantId, body);
  res.status(201).json({ success: true, data });
}

export async function updateVendorController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = giftcardsTenantId(req);
  if (!tenantId) {
    res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'tenant_id required' } });
    return;
  }
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  try {
    const existing = await getVendorByIdService(tenantId, id);
    const data = await updateVendorService(tenantId, id, req.body, existing?.name as string | undefined);
    res.json({ success: true, data });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'PGRST116') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vendor not found' } });
      return;
    }
    throw e;
  }
}

export async function deleteVendorController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = giftcardsTenantId(req);
  if (!tenantId) {
    res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'tenant_id required' } });
    return;
  }
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  try {
    const existing = await getVendorByIdService(tenantId, id);
    await deleteVendorService(tenantId, id, existing?.name as string | undefined);
    res.json({ success: true });
  } catch (e: unknown) {
    console.error('[Giftcards] deleteVendor error:', e);
    const err = e as { code?: string; message?: string };
    if (err?.code === 'PGRST116') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vendor not found' } });
      return;
    }
    res.status(500).json({
      success: false,
      error: { code: 'DELETE_FAILED', message: err?.message || 'Failed to delete vendor' },
    });
  }
}

// Payment Providers
export async function listPaymentProvidersController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = giftcardsTenantId(req);
  if (!tenantId) {
    res.json({ success: true, data: [] });
    return;
  }
  const status = req.query.status as string | undefined;
  const data = await listPaymentProvidersService(tenantId, status);
  res.json({ success: true, data });
}

export async function getPaymentProviderByIdController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = giftcardsTenantId(req);
  if (!tenantId) {
    res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'tenant_id required' } });
    return;
  }
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  try {
    const data = await getPaymentProviderByIdService(tenantId, id);
    res.json({ success: true, data });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'PGRST116') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payment provider not found' } });
      return;
    }
    throw e;
  }
}

export async function createPaymentProviderController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = giftcardsTenantId(req);
  if (!tenantId) {
    res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'tenant_id required' } });
    return;
  }
  const body = req.body;
  if (!body?.name) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name required' } });
    return;
  }
  const data = await createPaymentProviderService(tenantId, body);
  res.status(201).json({ success: true, data });
}

export async function updatePaymentProviderController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = giftcardsTenantId(req);
  if (!tenantId) {
    res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'tenant_id required' } });
    return;
  }
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  try {
    const existing = await getPaymentProviderByIdService(tenantId, id);
    const data = await updatePaymentProviderService(tenantId, id, req.body, existing?.name as string | undefined);
    res.json({ success: true, data });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'PGRST116') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payment provider not found' } });
      return;
    }
    throw e;
  }
}

export async function deletePaymentProviderController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = giftcardsTenantId(req);
  if (!tenantId) {
    res.status(403).json({ success: false, error: { code: 'TENANT_REQUIRED', message: 'tenant_id required' } });
    return;
  }
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  try {
    const existing = await getPaymentProviderByIdService(tenantId, id);
    await deletePaymentProviderService(tenantId, id, existing?.name as string | undefined);
    res.json({ success: true });
  } catch (e: unknown) {
    console.error('[Giftcards] deletePaymentProvider error:', e);
    const err = e as { code?: string; message?: string };
    if (err?.code === 'PGRST116') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payment provider not found' } });
      return;
    }
    res.status(500).json({
      success: false,
      error: { code: 'DELETE_FAILED', message: err?.message || 'Failed to delete payment provider' },
    });
  }
}
