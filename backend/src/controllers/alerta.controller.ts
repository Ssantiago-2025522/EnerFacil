import type { Request, Response } from 'express';
import * as alertaService from '../services/alerta.service';
import { usuarioId } from '../middlewares/auth.middleware';
import { parseId, parseOrThrow } from '../middlewares/validation.middleware';
import { created, ok } from '../utils/responses';
import { alertasQuerySchema } from '../validators/alerta.validator';

export async function listarConfig(req: Request, res: Response) {
  ok(res, await alertaService.listarConfig(usuarioId(req), parseOrThrow(alertasQuerySchema, req.query)));
}

export async function crearConfig(req: Request, res: Response) {
  created(res, await alertaService.crearConfig(usuarioId(req), req.body), 'Configuración de alerta creada');
}

export async function actualizarConfig(req: Request, res: Response) {
  const data = await alertaService.actualizarConfig(usuarioId(req), parseId(req.params['id']), req.body);
  ok(res, data, 'Configuración de alerta actualizada');
}

export async function obtenerEstado(req: Request, res: Response) {
  const q = parseOrThrow(alertasQuerySchema, req.query);
  ok(res, await alertaService.obtenerEstado(usuarioId(req), q.id_vivienda));
}
