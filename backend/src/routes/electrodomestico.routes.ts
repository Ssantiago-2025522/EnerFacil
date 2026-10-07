import { Router } from 'express';
import * as ctrl from '../controllers/electrodomestico.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validation.middleware';
import {
  actualizarElectrodomesticoSchema,
  crearElectrodomesticoSchema,
} from '../validators/electrodomestico.validator';

const router = Router();
router.use(authMiddleware);

// Las rutas del catálogo van ANTES de '/:id' para que "catalogo" no se interprete como un id
router.get('/catalogo', ctrl.listarCatalogo);
router.get('/catalogo/:id', ctrl.obtenerCatalogo);

router.get('/', ctrl.listar);
router.get('/:id', ctrl.obtener);
router.post('/', validateBody(crearElectrodomesticoSchema), ctrl.crear);
router.put('/:id', validateBody(actualizarElectrodomesticoSchema), ctrl.actualizar);
router.delete('/:id', ctrl.eliminar);

export default router;
