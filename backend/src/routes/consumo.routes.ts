import { Router } from 'express';
import * as ctrl from '../controllers/consumo.controller';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validateBody } from '../middlewares/validation.middleware';
import {
  actualizarUsoSchema,
  calcularPeriodoSchema,
  crearLecturaSchema,
  crearUsoSchema,
} from '../validators/consumo.validator';

const router = Router();
router.use(authMiddleware);

// Lecturas manuales del medidor
router.get('/lecturas', ctrl.listarLecturas);
router.get('/lecturas/:id', ctrl.obtenerLectura);
router.post('/lecturas', validateBody(crearLecturaSchema), ctrl.crearLectura);
router.delete('/lecturas/:id', ctrl.eliminarLectura);

// Horas de uso por electrodoméstico (kwh_calculado lo genera MySQL)
router.get('/usos', ctrl.listarUsos);
router.get('/usos/:id', ctrl.obtenerUso);
router.post('/usos', validateBody(crearUsoSchema), ctrl.crearUso);
router.put('/usos/:id', validateBody(actualizarUsoSchema), ctrl.actualizarUso);
router.delete('/usos/:id', ctrl.eliminarUso);

// Proyección (sin guardar) y periodos guardados
router.get('/proyeccion', ctrl.obtenerProyeccion);
router.get('/periodos', ctrl.listarPeriodos);
router.get('/periodos/:id', ctrl.obtenerPeriodo);
router.post('/periodos/calcular', validateBody(calcularPeriodoSchema), ctrl.calcularPeriodo);

export default router;
