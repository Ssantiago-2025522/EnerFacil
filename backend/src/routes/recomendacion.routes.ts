import { Router } from 'express';
import * as ctrl from '../controllers/recomendacion.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validation.middleware';
import { actualizarRecomendacionSchema, generarRecomendacionesSchema } from '../validators/recomendacion.validator';

const router = Router();
router.use(authMiddleware);

router.get('/', ctrl.listar);
router.post('/generar', validateBody(generarRecomendacionesSchema), ctrl.generar);
router.put('/:id', validateBody(actualizarRecomendacionSchema), ctrl.actualizarEstado);

export default router;
