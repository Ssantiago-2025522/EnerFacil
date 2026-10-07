import type { Request, Response } from 'express';
import * as tarifaService from '../services/tarifa.service';
import { usuarioId } from '../middlewares/auth.middleware';
import { parseId, parseOrThrow } from '../middlewares/validation.middleware';
import { created, ok } from '../utils/responses';
import { tarifaActualQuerySchema, tarifasQuerySchema } from '../validators/tarifa.validator';

export async function listar(req: Request, res: Response) {
  ok(res, await tarifaService.listar(usuarioId(req), parseOrThrow(tarifasQuerySchema, req.query)));
}

export async function actual(req: Request, res: Response) {
  const q = parseOrThrow(tarifaActualQuerySchema, req.query);
  ok(res, await tarifaService.obtenerActual(usuarioId(req), q.id_vivienda));
}

export async function obtener(req: Request, res: Response) {
  ok(res, await tarifaService.obtener(usuarioId(req), parseId(req.params['id'])));
}

export async function crear(req: Request, res: Response) {
  created(res, await tarifaService.crear(usuarioId(req), req.body), 'Tarifa personalizada creada');
}

export async function actualizar(req: Request, res: Response) {
  const data = await tarifaService.actualizar(usuarioId(req), parseId(req.params['id']), req.body);
  ok(res, data, 'Tarifa actualizada');
}

export async function eliminar(req: Request, res: Response) {
  await tarifaService.eliminar(usuarioId(req), parseId(req.params['id']));
  ok(res, null, 'Tarifa eliminada');
}

export async function asignar(req: Request, res: Response) {
  const data = await tarifaService.asignar(usuarioId(req), parseId(req.params['id']), req.body.id_vivienda);
  ok(res, data, 'Tarifa asignada a la vivienda');
}
