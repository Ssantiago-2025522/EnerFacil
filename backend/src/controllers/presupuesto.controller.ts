import type { Request, Response } from 'express';
import * as presupuestoService from '../services/presupuesto.service';
import { usuarioId } from '../middlewares/auth.middleware';
import { parseId, parseOrThrow } from '../middlewares/validation.middleware';
import { created, ok } from '../utils/responses';
import { presupuestosQuerySchema } from '../validators/presupuesto.validator';

export async function listar(req: Request, res: Response) {
  ok(res, await presupuestoService.listar(usuarioId(req), parseOrThrow(presupuestosQuerySchema, req.query)));
}

export async function crear(req: Request, res: Response) {
  created(res, await presupuestoService.crear(usuarioId(req), req.body), 'Presupuesto creado');
}

export async function actualizar(req: Request, res: Response) {
  const data = await presupuestoService.actualizar(usuarioId(req), parseId(req.params['id']), req.body);
  ok(res, data, 'Presupuesto actualizado');
}
