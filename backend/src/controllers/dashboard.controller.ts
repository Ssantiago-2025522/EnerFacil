import type { Request, Response } from 'express';
import * as dashboardService from '../services/dashboard.service';
import { usuarioId } from '../middlewares/auth.middleware';
import { parseOrThrow } from '../middlewares/validation.middleware';
import { ok } from '../utils/responses';
import { dashboardQuerySchema } from '../validators/dashboard.validator';

export async function obtener(req: Request, res: Response) {
  const q = parseOrThrow(dashboardQuerySchema, req.query);
  ok(res, await dashboardService.obtenerDashboard(usuarioId(req), q.id_vivienda));
}
