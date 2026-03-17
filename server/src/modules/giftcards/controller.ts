/**
 * Giftcards Controller
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
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

export async function listGiftCardsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = req.user?.tenant_id ?? '';
  const data = await listGiftCardsService(tenantId);
  res.json({ success: true, data });
}

// Cards
export async function listCardsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const status = req.query.status as string | undefined;
  const data = await listCardsService(status);
  res.json({ success: true, data });
}

export async function getCardByIdController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  try {
    const data = await getCardByIdService(id);
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
  const body = req.body;
  if (!body?.name) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name required' } });
    return;
  }
  const data = await createCardService(body);
  res.status(201).json({ success: true, data });
}

export async function updateCardController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  try {
    const data = await updateCardService(id, req.body);
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
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  try {
    await deleteCardService(id);
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
  const status = req.query.status as string | undefined;
  const data = await listVendorsService(status);
  res.json({ success: true, data });
}

export async function getVendorByIdController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  try {
    const data = await getVendorByIdService(id);
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
  const body = req.body;
  if (!body?.name) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name required' } });
    return;
  }
  const data = await createVendorService(body);
  res.status(201).json({ success: true, data });
}

export async function updateVendorController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  try {
    const existing = await getVendorByIdService(id);
    const data = await updateVendorService(id, req.body, existing?.name);
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
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  try {
    const existing = await getVendorByIdService(id);
    await deleteVendorService(id, existing?.name);
    res.json({ success: true });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'PGRST116') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Vendor not found' } });
      return;
    }
    throw e;
  }
}

// Payment Providers
export async function listPaymentProvidersController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const status = req.query.status as string | undefined;
  const data = await listPaymentProvidersService(status);
  res.json({ success: true, data });
}

export async function getPaymentProviderByIdController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  try {
    const data = await getPaymentProviderByIdService(id);
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
  const body = req.body;
  if (!body?.name) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'name required' } });
    return;
  }
  const data = await createPaymentProviderService(body);
  res.status(201).json({ success: true, data });
}

export async function updatePaymentProviderController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  try {
    const existing = await getPaymentProviderByIdService(id);
    const data = await updatePaymentProviderService(id, req.body, existing?.name);
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
  const id = req.params.id;
  if (!id) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'id required' } });
    return;
  }
  try {
    const existing = await getPaymentProviderByIdService(id);
    await deletePaymentProviderService(id, existing?.name);
    res.json({ success: true });
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err?.code === 'PGRST116') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Payment provider not found' } });
      return;
    }
    throw e;
  }
}
