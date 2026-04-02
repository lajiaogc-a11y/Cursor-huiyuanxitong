import { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../../middlewares/auth.js';
import * as ctrl from './controller.js';

const router = Router();

router.get('/', authMiddleware, (req, res, next) => ctrl.getLedger(req as AuthenticatedRequest, res).catch(next));
router.get('/all', authMiddleware, (req, res, next) => ctrl.getLedgerAll(req as AuthenticatedRequest, res).catch(next));
router.get('/balance', authMiddleware, (req, res, next) => ctrl.getLedgerBalance(req as AuthenticatedRequest, res).catch(next));
router.post('/', authMiddleware, (req, res, next) => ctrl.postLedger(req as AuthenticatedRequest, res).catch(next));
router.post('/reconcile', authMiddleware, (req, res, next) => ctrl.postLedgerReconcile(req as AuthenticatedRequest, res).catch(next));
router.post('/reconcile-and-correct', authMiddleware, (req, res, next) => ctrl.postLedgerReconcileAndCorrect(req as AuthenticatedRequest, res).catch(next));
router.post('/soft-delete', authMiddleware, (req, res, next) => ctrl.postLedgerSoftDelete(req as AuthenticatedRequest, res).catch(next));
router.post('/initial-balance', authMiddleware, (req, res, next) => ctrl.postLedgerInitialBalance(req as AuthenticatedRequest, res).catch(next));
router.post('/reverse-initial-balance', authMiddleware, (req, res, next) => ctrl.postReverseInitialBalance(req as AuthenticatedRequest, res).catch(next));
router.post('/reverse-all', authMiddleware, (req, res, next) => ctrl.postReverseAll(req as AuthenticatedRequest, res).catch(next));
router.delete('/', authMiddleware, (req, res, next) => ctrl.deleteLedgerAccount(req as AuthenticatedRequest, res).catch(next));

export default router;
