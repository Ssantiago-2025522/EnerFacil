import type { Request, Response } from 'express';
import * as recomendacionService from '../services/recomendacion.service';
import { usuarioId } from '../middlewares/auth.middleware';
import { parseId, parseOrThrow } from '../middlewares/validation.middleware';
import { ok } from '../utils/responses';
import { recomendacionesQuerySchema } from '../validators/recomendacion.validator';

export async function listar(req: Request, res: Response) {
  ok(res, await recomendacionService.listar(usuarioId(req), parseOrThrow(recomendacionesQuerySchema, req.query)));
}

export async function generar(req: Request, res: Response) {
  const data = await recomendacionService.generar(usuarioId(req), req.body.id_vivienda);
  ok(res, data, 'Recomendaciones generadas');
}

export async function actualizarEstado(req: Request, res: Response) {
  const data = await recomendacionService.actualizarEstado(usuarioId(req), parseId(req.params['id']), req.body.estado);
  ok(res, data, 'Recomendación actualizada');
}
