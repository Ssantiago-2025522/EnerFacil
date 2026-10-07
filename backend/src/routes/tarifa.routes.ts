import { Router } from 'express';
import * as ctrl from '../controllers/tarifa.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validation.middleware';
import { actualizarTarifaSchema, asignarTarifaSchema, crearTarifaSchema } from '../validators/tarifa.validator';

const router = Router();
router.use(authMiddleware);

router.get('/', ctrl.listar);
// '/actual' va antes de '/:id' para que no se interprete como un id
router.get('/actual', ctrl.actual);
router.get('/:id', ctrl.obtener);
router.post('/', validateBody(crearTarifaSchema), ctrl.crear);
router.put('/:id', validateBody(actualizarTarifaSchema), ctrl.actualizar);
router.delete('/:id', ctrl.eliminar);
router.post('/:id/asignar', validateBody(asignarTarifaSchema), ctrl.asignar);

export default router;
