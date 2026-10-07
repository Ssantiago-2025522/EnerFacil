import { Router } from 'express';
import * as ctrl from '../controllers/alerta.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validation.middleware';
import { actualizarAlertaConfigSchema, crearAlertaConfigSchema } from '../validators/alerta.validator';

const router = Router();
router.use(authMiddleware);

// Configuración de alertas (alertas_config)
router.get('/config', ctrl.listarConfig);
router.post('/config', validateBody(crearAlertaConfigSchema), ctrl.crearConfig);
router.put('/config/:id', validateBody(actualizarAlertaConfigSchema), ctrl.actualizarConfig);

// Semáforo actual (proyección vs. presupuesto vigente)
router.get('/estado', ctrl.obtenerEstado);

export default router;
