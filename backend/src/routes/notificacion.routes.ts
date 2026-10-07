import { Router } from 'express';
import * as ctrl from '../controllers/notificacion.controller';
import { authMiddleware } from '../middlewares/auth.middleware';

const router = Router();
router.use(authMiddleware);

router.get('/', ctrl.listar);
router.put('/:id/leida', ctrl.marcarLeida);

export default router;
