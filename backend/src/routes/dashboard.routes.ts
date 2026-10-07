import { Router } from 'express';
import * as ctrl from '../controllers/dashboard.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/', ctrl.obtener);

export default router;
