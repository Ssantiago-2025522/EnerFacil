import { Router } from 'express';
import * as ctrl from '../controllers/ambiente.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validation.middleware';
import { actualizarAmbienteSchema, crearAmbienteSchema } from '../validators/ambiente.validator';

const router = Router();
router.use(authMiddleware);

router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);
router.post('/', validateBody(crearAmbienteSchema), ctrl.crear);
router.put('/:id', validateBody(actualizarAmbienteSchema), ctrl.actualizar);
router.delete('/:id', ctrl.eliminar);

export default router;
