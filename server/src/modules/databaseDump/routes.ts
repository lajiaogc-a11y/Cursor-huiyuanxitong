import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import { databaseDumpAuthMiddleware } from './middleware.js';
import { mysqlDumpController } from './controller.js';

const router = Router();

router.use(authMiddleware);
router.use(databaseDumpAuthMiddleware);
router.get('/mysql-dump', mysqlDumpController);

export default router;
