import { Router } from 'express';
import * as ctrl from '../controllers/vivienda.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validation.middleware';
import { actualizarViviendaSchema, crearViviendaSchema } from '../validators/vivienda.validator';

const router = Router();
router.use(authMiddleware);

router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);
router.post('/', validateBody(crearViviendaSchema), ctrl.crear);
router.put('/:id', validateBody(actualizarViviendaSchema), ctrl.actualizar);
router.delete('/:id', ctrl.eliminar);

export default router;
