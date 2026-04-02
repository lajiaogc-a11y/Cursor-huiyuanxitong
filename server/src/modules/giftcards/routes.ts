/**
 * Giftcards 路由
 * 结构: /api/giftcards (legacy cards list), /api/giftcards/cards, /api/giftcards/vendors, /api/giftcards/providers
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import {
  listGiftCardsController,
  listCardsController,
  getCardByIdController,
  createCardController,
  updateCardController,
  deleteCardController,
  listVendorsController,
  getVendorByIdController,
  createVendorController,
  updateVendorController,
  deleteVendorController,
  listPaymentProvidersController,
  getPaymentProviderByIdController,
  createPaymentProviderController,
  updatePaymentProviderController,
  deletePaymentProviderController,
} from './controller.js';

const router = Router();

// Legacy - GET /api/giftcards returns active cards
router.get('/', authMiddleware, listGiftCardsController);

// Cards
router.get('/cards', authMiddleware, listCardsController);
router.get('/cards/:id', authMiddleware, getCardByIdController);
router.post('/cards', authMiddleware, createCardController);
router.put('/cards/:id', authMiddleware, updateCardController);
router.delete('/cards/:id', authMiddleware, deleteCardController);

// Vendors
router.get('/vendors', authMiddleware, listVendorsController);
router.get('/vendors/:id', authMiddleware, getVendorByIdController);
router.post('/vendors', authMiddleware, createVendorController);
router.put('/vendors/:id', authMiddleware, updateVendorController);
router.delete('/vendors/:id', authMiddleware, deleteVendorController);

// Payment Providers
router.get('/providers', authMiddleware, listPaymentProvidersController);
router.get('/providers/:id', authMiddleware, getPaymentProviderByIdController);
router.post('/providers', authMiddleware, createPaymentProviderController);
router.put('/providers/:id', authMiddleware, updatePaymentProviderController);
router.delete('/providers/:id', authMiddleware, deletePaymentProviderController);

export default router;
