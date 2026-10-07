import { Router } from 'express';
import * as ctrl from '../controllers/presupuesto.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validation.middleware';
import { actualizarPresupuestoSchema, crearPresupuestoSchema } from '../validators/presupuesto.validator';

const router = Router();
router.use(authMiddleware);

router.get('/', ctrl.listar);
router.post('/', validateBody(crearPresupuestoSchema), ctrl.crear);
router.put('/:id', validateBody(actualizarPresupuestoSchema), ctrl.actualizar);

export default router;
